/* ==========================================================================
   Lógica del cuadro de búsqueda: texto, sugerencias y navegación por teclado.

   Lo que este hook YA NO hace, desde que la aplicación tiene enrutado: cargar
   el Pokémon. Antes guardaba el espécimen seleccionado en su propio estado;
   ahora el espécimen seleccionado es el que dice la URL (`/pokemon/:name`) y
   de cargarlo se encarga `usePokemon`.

   El cambio no es cosmético: mientras el estado vivía aquí, recargar la
   página o compartir un enlace perdía la consulta. Ahora la URL es la fuente
   de verdad y sobrevive a ambas cosas.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pokeIndex from '../services/pokeIndex';
import { normalizeTerm } from '../utils/format';
import { useDebouncedValue } from './useDebouncedValue';
import type { SearchMode, Suggestion } from '../types/pokemon';

const DEBOUNCE_LOCAL_MS = 120;
const DEBOUNCE_REMOTE_MS = 300;
const MAX_SUGGESTIONS = 8;

export interface UseSearchBox {
  term: string;
  setTerm: (value: string) => void;
  /** Escribe el campo sin marcarlo como "el usuario está tecleando". */
  syncTerm: (value: string) => void;

  suggestions: Suggestion[];
  highlightedIndex: number;
  moveHighlight: (delta: 1 | -1) => void;
  setHighlightedIndex: (index: number) => void;

  /** Nombre que debería abrirse al pulsar Enter, o null si no hay nada. */
  resolveSubmit: () => string | null;
  reset: () => void;

  indexReady: boolean;
  indexSize: number;
  mode: SearchMode;
}

export function useSearchBox(): UseSearchBox {
  const [term, setTermState] = useState('');
  const [indexReady, setIndexReady] = useState(false);
  const [indexSize, setIndexSize] = useState(0);
  const [mode, setMode] = useState<SearchMode>('local');
  const [highlightedIndex, setHighlightedIndexState] = useState(-1);

  /* ── Efecto: cargar el índice una vez al montar ────────────────────────
     Caso de libro de useEffect: sincronizar el componente con un sistema
     externo (la red). La bandera `alive` evita tocar el estado si el
     componente se desmontó mientras la petición estaba en vuelo. */
  useEffect(() => {
    let alive = true;

    void pokeIndex.load().then((ok) => {
      if (!alive) return;
      setIndexReady(ok);
      setIndexSize(pokeIndex.size());
      setMode(ok ? 'local' : 'remote');
    });

    return () => {
      alive = false;
    };
  }, []);

  const debouncedTerm = useDebouncedValue(
    term,
    mode === 'local' ? DEBOUNCE_LOCAL_MS : DEBOUNCE_REMOTE_MS,
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!indexReady) return [];
    return pokeIndex.search(debouncedTerm, MAX_SUGGESTIONS);
  }, [debouncedTerm, indexReady]);

  const suggestionsRef = useRef(suggestions);
  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  const termRef = useRef(term);
  useEffect(() => {
    termRef.current = term;
  }, [term]);

  const highlightRef = useRef(highlightedIndex);
  useEffect(() => {
    highlightRef.current = highlightedIndex;
  }, [highlightedIndex]);

  const setTerm = useCallback((value: string) => {
    setTermState(value);
    /* Se reinicia aquí, en el evento que causa el cambio, y no en un efecto
       sobre `suggestions`: conservar el índice haría que Enter abriera una
       entrada distinta de la resaltada cuando la lista se reordena. */
    setHighlightedIndexState(-1);
  }, []);

  /** Para sincronizar el campo con la URL sin simular tecleo. */
  const syncTerm = useCallback((value: string) => {
    setTermState(value);
    setHighlightedIndexState(-1);
  }, []);

  const moveHighlight = useCallback((delta: 1 | -1) => {
    setHighlightedIndexState((prev) => {
      const total = suggestionsRef.current.length;
      if (total === 0) return -1;
      const next = prev + delta;
      if (next < 0) return total - 1; // ciclo
      if (next >= total) return 0;
      return next;
    });
  }, []);

  const setHighlightedIndex = useCallback((index: number) => {
    setHighlightedIndexState(index);
  }, []);

  const resolveSubmit = useCallback((): string | null => {
    const chosen = suggestionsRef.current[highlightRef.current];
    if (highlightRef.current >= 0 && chosen) return chosen.name;

    // Sin sugerencia marcada se busca el texto literal (PRD FR-01).
    const literal = normalizeTerm(termRef.current);
    return literal.length > 0 ? literal : null;
  }, []);

  const reset = useCallback(() => {
    setTermState('');
    setHighlightedIndexState(-1);
  }, []);

  return {
    term,
    setTerm,
    syncTerm,
    suggestions,
    highlightedIndex,
    moveHighlight,
    setHighlightedIndex,
    resolveSubmit,
    reset,
    indexReady,
    indexSize,
    mode,
  };
}
