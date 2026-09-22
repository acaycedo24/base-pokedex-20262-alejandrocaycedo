/* ==========================================================================
   Capa de acceso a PokeAPI.

   Implementa los tres niveles de caché de ARCHITECTURE.md §ADR-04:
     1. LRU en memoria         → evita la red por completo
     2. Deduplicación en vuelo → dos peticiones iguales comparten una sola
     3. AbortController        → cancela lo que ya no interesa

   El cuarto nivel lo aporta el navegador gracias al
   `cache-control: public, max-age=86400` que devuelve PokeAPI.

   Nada de React aquí: este módulo es deliberadamente ajeno a la UI para que
   la caché no provoque renders.
   ========================================================================== */

import { LRU } from '../utils/lru';
import { normalizeTerm, toDisplayName, typeColorVar, typeLabel } from '../utils/format';
import { STAT_KEYS, STAT_LABELS } from '../types/pokemon';
import type { Pokemon, RawPokemon, StatKey } from '../types/pokemon';

export const API_BASE = 'https://pokeapi.co/api/v2';

const DETAIL_CACHE_SIZE = 100;

/* ── Errores de dominio ──────────────────────────────────────────────────
   Se distinguen porque la interfaz los presenta de forma distinta: un 404 es
   "no existe ese espécimen" y se queda en la terminal; un fallo de red es un
   problema del sistema y ofrece reintentar (PRD FR-01).                    */

export class NotFoundError extends Error {
  readonly term: string;
  constructor(term: string) {
    super(`No existe ningún espécimen llamado "${term}"`);
    this.name = 'NotFoundError';
    this.term = term;
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Una cancelación es el resultado esperado de `abort()`, no un fallo. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function createAbortError(): DOMException {
  return new DOMException('Petición cancelada', 'AbortError');
}

/* ── Normalización ───────────────────────────────────────────────────────── */

/**
 * Convierte la respuesta de PokeAPI al modelo propio. Es la única frontera
 * con la forma de la API externa (ARCHITECTURE.md §6).
 */
export function normalizePokemon(raw: RawPokemon): Pokemon {
  const other = raw.sprites.other;
  const artwork =
    other?.['official-artwork']?.front_default ??
    other?.home?.front_default ??
    raw.sprites.front_default ??
    '';

  /* Las estadísticas se indexan por nombre en lugar de confiar en el orden
     del array: así el orden de las barras es estable aunque la API cambie. */
  const byStat = new Map<string, number>(
    raw.stats.map((s) => [s.stat.name, s.base_stat]),
  );

  return {
    id: raw.id,
    name: raw.name,
    displayName: toDisplayName(raw.name),
    types: raw.types
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((t) => ({
        name: t.type.name,
        label: typeLabel(t.type.name),
        color: typeColorVar(t.type.name),
      })),
    sprite: artwork,
    spriteFallback: raw.sprites.front_default ?? artwork,
    heightM: raw.height / 10,
    weightKg: raw.weight / 10,
    abilities: raw.abilities
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((a) => ({ name: toDisplayName(a.ability.name), hidden: a.is_hidden })),
    stats: STAT_KEYS.map((key: StatKey) => ({
      key,
      label: STAT_LABELS[key],
      value: byStat.get(key) ?? 0,
    })),
    cries: {
      latest: raw.cries?.latest ?? undefined,
      legacy: raw.cries?.legacy ?? undefined,
    },
  };
}

/* ── Caché y deduplicación ───────────────────────────────────────────────── */

const detailCache = new LRU<string, Pokemon>(DETAIL_CACHE_SIZE);

interface InFlight {
  promise: Promise<Pokemon>;
  controller: AbortController;
  /** Cuántos llamadores siguen esperando esta petición. */
  waiters: number;
}

const inFlight = new Map<string, InFlight>();

async function requestPokemon(key: string, signal: AbortSignal): Promise<Pokemon> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/pokemon/${encodeURIComponent(key)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('Sin enlace con el archivo central');
  }

  if (response.status === 404) throw new NotFoundError(key);
  if (!response.ok) {
    throw new ApiError(`El archivo respondió ${response.status}`, response.status);
  }

  return normalizePokemon((await response.json()) as RawPokemon);
}

/**
 * Conecta a un llamador con una petición compartida.
 *
 * El detalle importante: cancelar aquí NO aborta la petición real mientras
 * queden otros interesados. La petición solo se aborta cuando el último
 * llamador se va. Sin este recuento, dos búsquedas simultáneas del mismo
 * Pokémon se romperían entre sí al compartir promesa.
 */
function attach(entry: InFlight, key: string, signal?: AbortSignal): Promise<Pokemon> {
  if (signal?.aborted) return Promise.reject(createAbortError());

  entry.waiters += 1;

  return new Promise<Pokemon>((resolve, reject) => {
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      entry.waiters -= 1;
      if (entry.waiters === 0) {
        entry.controller.abort();
        if (inFlight.get(key) === entry) inFlight.delete(key);
      }
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      entry.waiters -= 1;
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    entry.promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

/**
 * Obtiene un espécimen por nombre o por número de Pokédex.
 *
 * @param term   nombre ('pikachu', 'mr mime') o id ('25'). Se normaliza.
 * @param signal permite al llamador desentenderse de la petición.
 */
export function getPokemon(
  term: string | number,
  signal?: AbortSignal,
): Promise<Pokemon> {
  const key = normalizeTerm(String(term));

  if (!key) return Promise.reject(new NotFoundError(''));

  // Nivel 1: memoria.
  const cached = detailCache.get(key);
  if (cached) return Promise.resolve(cached);

  // Nivel 2: ¿ya hay una petición igual en vuelo?
  let entry = inFlight.get(key);

  if (!entry) {
    const controller = new AbortController();
    const record: Partial<InFlight> & { controller: AbortController; waiters: number } = {
      controller,
      waiters: 0,
    };

    record.promise = requestPokemon(key, controller.signal)
      .then((pokemon) => {
        detailCache.set(key, pokemon);
        // También se indexa por id: buscar '25' y 'pikachu' comparte caché.
        detailCache.set(String(pokemon.id), pokemon);
        return pokemon;
      })
      .finally(() => {
        if (inFlight.get(key) === (record as InFlight)) inFlight.delete(key);
      });

    entry = record as InFlight;
    inFlight.set(key, entry);
  }

  return attach(entry, key, signal);
}

/** Solo para pruebas manuales desde la consola. */
export function clearDetailCache(): void {
  detailCache.clear();
  inFlight.clear();
}
