/* ==========================================================================
   Carga del espécimen que indica la URL.

   Este hook es el puente entre el Router y los datos: recibe el `:name` de la
   ruta y devuelve el Pokémon. Como efecto secundario reproduce el grito y
   registra la consulta en el historial — de ahí que viva en un `useEffect` y
   no en el render.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { getPokemon, isAbortError, NotFoundError } from '../services/pokeApi';
import { normalizeTerm, toDisplayName } from '../utils/format';
import { useAudio } from './useAudio';
import { useRecentSearches } from './useRecentSearches';
import type { Pokemon } from '../types/pokemon';

export type PokemonStatus = 'idle' | 'loading' | 'success' | 'notfound' | 'error';

export interface UsePokemon {
  pokemon: Pokemon | null;
  status: PokemonStatus;
  error: string | null;
  /** Reintenta la última carga fallida. */
  retry: () => void;
}

interface State {
  /** Nombre normalizado al que pertenece este resultado. */
  forName: string | null;
  status: PokemonStatus;
  pokemon: Pokemon | null;
  error: string | null;
}

const INITIAL: State = { forName: null, status: 'idle', pokemon: null, error: null };

export function usePokemon(name: string | undefined): UsePokemon {
  const { playCry } = useAudio();
  const { add } = useRecentSearches();

  const [state, setState] = useState<State>(INITIAL);
  const [attempt, setAttempt] = useState(0);

  const query = name ? normalizeTerm(name) : '';
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) return;

    // Cancela lo anterior: navegar rápido no debe encolar peticiones.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    getPokemon(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({ forName: query, status: 'success', pokemon: result, error: null });

        /* Efectos secundarios de haber encontrado un espécimen. Van aquí y no
           en el render porque el render debe ser puro: se ejecuta más veces
           de las que uno cree, y sonaría el grito en cada una. */
        add(result);
        void playCry(result.cries);
      })
      .catch((caught: unknown) => {
        if (isAbortError(caught) || controller.signal.aborted) return;

        if (caught instanceof NotFoundError) {
          setState({
            forName: query,
            status: 'notfound',
            pokemon: null,
            error: `"${toDisplayName(query)}" no figura en el archivo`,
          });
        } else {
          setState({
            forName: query,
            status: 'error',
            pokemon: null,
            error:
              caught instanceof Error ? caught.message : 'Fallo desconocido del sistema',
          });
        }
      });

    return () => controller.abort();
  }, [query, attempt, add, playCry]);

  /* Lo guardado solo vale para el nombre que lo pidió. Derivarlo así evita un
     efecto que "limpie" el estado al cambiar de ruta, que provocaría un
     render extra mostrando los datos del Pokémon anterior. */
  const matches = state.forName === query;

  return {
    pokemon: matches ? state.pokemon : null,
    status: !query ? 'idle' : matches ? state.status : 'loading',
    error: matches ? state.error : null,
    retry: () => setAttempt((n) => n + 1),
  };
}
