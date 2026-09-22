/* ==========================================================================
   Índice local de especímenes.

   Este módulo es la razón por la que el autocompletado de PokeSearch no toca
   la red (ARCHITECTURE.md §ADR-02). Se descarga una vez el catálogo completo
   — medido: 93 KB, 1351 entradas, ~0.28 s — se persiste en LocalStorage y
   todas las búsquedas posteriores se resuelven en memoria.

   Motivo de fondo: PokeAPI no ofrece búsqueda por prefijo. Filtrar en cliente
   no es una optimización, es la única forma correcta de hacer autocompletado
   contra esta API.
   ========================================================================== */

import { API_BASE } from './pokeApi';
import { KEYS, readJSON, writeJSON } from './storage';
import { idFromUrl, isNumeric, normalizeTerm, toDisplayName } from '../utils/format';
import type {
  IndexEntry,
  RawPokemonListResponse,
  Suggestion,
} from '../types/pokemon';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const DEFAULT_LIMIT = 8;

interface StoredIndex {
  fetchedAt: number;
  entries: IndexEntry[];
}

/**
 * Registro en memoria. `label` y `haystack` se precalculan al cargar para no
 * recomputarlos 1351 veces en cada pulsación de tecla; no se persisten porque
 * derivarlos cuesta menos que leerlos del disco.
 */
interface IndexRecord {
  name: string;
  id: number;
  label: string;
  /** `label` en minúsculas, para comparar sin `toLowerCase()` por búsqueda. */
  haystack: string;
}

let records: IndexRecord[] = [];
let loading: Promise<boolean> | null = null;

function hydrate(entries: IndexEntry[]): void {
  records = entries.map((e) => {
    const label = toDisplayName(e.name);
    return { name: e.name, id: e.id, label, haystack: label.toLowerCase() };
  });
}

/**
 * Carga el índice: primero LocalStorage, luego la red.
 *
 * @returns true si el índice quedó disponible (modo 'local'), false si hubo
 *          que rendirse y el buscador debe degradar a modo 'remote'.
 */
export function load(): Promise<boolean> {
  if (records.length > 0) return Promise.resolve(true);
  if (loading) return loading;

  loading = (async () => {
    const stored = readJSON<StoredIndex>(KEYS.index);
    const fresh =
      stored !== null &&
      Array.isArray(stored.entries) &&
      stored.entries.length > 0 &&
      Date.now() - stored.fetchedAt < TTL_MS;

    if (fresh) {
      hydrate(stored.entries);
      return true;
    }

    try {
      const response = await fetch(`${API_BASE}/pokemon?limit=100000`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(String(response.status));

      const data = (await response.json()) as RawPokemonListResponse;

      /* El listado no incluye el id como campo: hay que sacarlo de la URL.
         Se descartan las entradas cuyo id no se pueda resolver en lugar de
         guardar un 0 que luego rompería la navegación. */
      const entries: IndexEntry[] = data.results
        .map((r) => ({ name: r.name, id: idFromUrl(r.url) }))
        .filter((e) => e.id > 0);

      if (entries.length === 0) throw new Error('Índice vacío');

      hydrate(entries);
      writeJSON(KEYS.index, { fetchedAt: Date.now(), entries } satisfies StoredIndex);
      return true;
    } catch {
      /* Última oportunidad: un índice caducado sigue siendo mucho mejor que
         ninguno. Los Pokémon no desaparecen del catálogo. */
      if (stored && Array.isArray(stored.entries) && stored.entries.length > 0) {
        hydrate(stored.entries);
        return true;
      }
      loading = null; // permite reintentar más tarde
      return false;
    }
  })();

  return loading;
}

export function isReady(): boolean {
  return records.length > 0;
}

export function size(): number {
  return records.length;
}

/* ── Búsqueda y ranking ──────────────────────────────────────────────────── */

/* Menor es mejor. El orden de estos grupos es lo que hace que escribir "char"
   proponga Charmander antes que Lickitung (que contiene "ch" pero no empieza
   por ahí). */
const RANK_EXACT = 0;
const RANK_PREFIX = 1;
const RANK_WORD = 2; // empieza un segmento: 'mega' en 'charizard-mega-x'
const RANK_SUBSTRING = 3;

interface Scored {
  record: IndexRecord;
  rank: number;
  at: number;
}

/**
 * Localiza el término dentro de la etiqueta visible para poder resaltarlo.
 *
 * Hace falta porque la etiqueta no es el slug: 'mr-mime' se muestra como
 * 'Mr. Mime', y el usuario puede haber escrito con espacios o con guiones.
 * Se prueban ambas formas y, si ninguna aparece en la etiqueta, se devuelve
 * un rango vacío en vez de resaltar el fragmento equivocado.
 */
function highlightRange(haystack: string, query: string): [number, number] {
  const spaced = query.replace(/-/g, ' ');
  let at = haystack.indexOf(spaced);
  if (at !== -1) return [at, at + spaced.length];

  at = haystack.indexOf(query);
  if (at !== -1) return [at, at + query.length];

  return [-1, -1];
}

function toSuggestion(record: IndexRecord, query: string): Suggestion {
  const [matchStart, matchEnd] = highlightRange(record.haystack, query);
  return {
    name: record.name,
    id: record.id,
    label: record.label,
    matchStart,
    matchEnd,
  };
}

/**
 * Filtra el índice en memoria. Sin red, sin promesas: devuelve de inmediato.
 *
 * Coste: un recorrido O(n) sobre 1351 cadenas cortas, del orden de décimas de
 * milisegundo. Hay margen de un orden de magnitud antes de necesitar un trie.
 */
export function search(term: string, limit = DEFAULT_LIMIT): Suggestion[] {
  const query = normalizeTerm(term);
  if (!query) return [];

  /* Búsqueda por número de Pokédex: '25' debe encontrar a Pikachu, y '2'
     debe proponer los que empiezan por 2 en orden numérico. */
  if (isNumeric(query)) {
    const exact = records.find((r) => r.id === Number(query));
    const byPrefix = records
      .filter((r) => String(r.id).startsWith(query) && r.id !== Number(query))
      .sort((a, b) => a.id - b.id);

    const ordered = exact ? [exact, ...byPrefix] : byPrefix;
    return ordered.slice(0, limit).map((r) => ({
      name: r.name,
      id: r.id,
      label: r.label,
      matchStart: -1,
      matchEnd: -1,
    }));
  }

  const scored: Scored[] = [];

  for (const record of records) {
    const at = record.name.indexOf(query);
    if (at === -1) continue;

    let rank: number;
    if (record.name === query) rank = RANK_EXACT;
    else if (at === 0) rank = RANK_PREFIX;
    else if (record.name[at - 1] === '-') rank = RANK_WORD;
    else rank = RANK_SUBSTRING;

    scored.push({ record, rank, at });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // Dentro del mismo grupo: primero el nombre más corto (más específico),
    // y a igual longitud, orden alfabético estable.
    if (a.record.name.length !== b.record.name.length) {
      return a.record.name.length - b.record.name.length;
    }
    return a.record.name.localeCompare(b.record.name);
  });

  return scored.slice(0, limit).map((s) => toSuggestion(s.record, query));
}

/** ¿Existe este nombre exacto en el índice? Evita una petición condenada al 404. */
export function exists(term: string): boolean {
  const query = normalizeTerm(term);
  if (!query) return false;
  if (isNumeric(query)) return records.some((r) => r.id === Number(query));
  return records.some((r) => r.name === query);
}
