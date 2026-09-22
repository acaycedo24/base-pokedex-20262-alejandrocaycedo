import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con un retardo, reiniciando la cuenta en cada cambio.
 *
 * Matiz importante en PokeSearch (ARCHITECTURE.md §ADR-03): como el
 * autocompletado filtra en memoria, este debounce NO protege a la red — la
 * protege del trabajo de render. El valor del input nunca pasa por aquí; solo
 * lo hace el término que alimenta el cálculo de sugerencias. El usuario ve su
 * texto aparecer sin retardo alguno.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), Math.max(0, delay));
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
