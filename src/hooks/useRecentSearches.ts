import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { KEYS, readJSON, writeJSON } from '../services/storage';
import type { Pokemon, RecentEntry } from '../types/pokemon';

const MAX_ENTRIES = 8;

export interface RecentApi {
  recent: RecentEntry[];
  add: (pokemon: Pokemon) => void;
  remove: (id: number) => void;
  clear: () => void;
}

function isValid(entry: unknown): entry is RecentEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Partial<RecentEntry>;
  return typeof e.id === 'number' && typeof e.name === 'string';
}

const RecentCtx = createContext<RecentApi | null>(null);
export const RecentContextProvider = RecentCtx.Provider;

/**
 * Motor del historial (PRD FR-03). Lo instancia RecentProvider UNA sola vez.
 *
 * Tiene que ser compartido y no un hook suelto por componente: lo escribe
 * `usePokemon` cuando una consulta tiene éxito y lo lee el panel de recientes
 * del buscador. Si cada uno llamara a su propio hook tendrían dos estados
 * independientes y el panel nunca se enteraría de las búsquedas nuevas.
 */
export function useRecentEngine(max: number = MAX_ENTRIES): RecentApi {
  const [recent, setRecent] = useState<RecentEntry[]>(() => {
    const stored = readJSON<RecentEntry[]>(KEYS.recent);
    if (!Array.isArray(stored)) return [];
    return stored.filter(isValid).slice(0, max);
  });

  const hydrated = useRef(false);

  useEffect(() => {
    // No se reescribe en el montaje lo que se acaba de leer.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeJSON(KEYS.recent, recent);
  }, [recent]);

  const add = useCallback(
    (pokemon: Pokemon) => {
      const entry: RecentEntry = {
        id: pokemon.id,
        name: pokemon.name,
        displayName: pokemon.displayName,
        sprite: pokemon.spriteFallback || pokemon.sprite,
        at: Date.now(),
      };

      setRecent((prev) => {
        /* El estado en React es inmutable: no se toca `prev`, se construye un
           array nuevo. Filtrar y anteponer implementa la semántica MRU —
           repetir una búsqueda la promueve en vez de duplicarla. */
        const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, max);
        /* Si nada cambió de verdad se devuelve el mismo array: React compara
           por identidad y se ahorra el render. */
        const unchanged =
          next.length === prev.length && next.every((e, i) => e.id === prev[i]?.id);
        return unchanged ? prev : next;
      });
    },
    [max],
  );

  const remove = useCallback((id: number) => {
    setRecent((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(() => setRecent([]), []);

  return { recent, add, remove, clear };
}

/** Hook que consumen los componentes. */
export function useRecentSearches(): RecentApi {
  const value = useContext(RecentCtx);
  if (!value) throw new Error('useRecentSearches debe usarse dentro de <RecentProvider>');
  return value;
}
