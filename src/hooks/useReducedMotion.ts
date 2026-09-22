import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Preferencia de movimiento reducido del sistema, reactiva a cambios.
 *
 * Los efectos puramente declarativos ya se neutralizan desde CSS. Este hook
 * existe para los que no se pueden expresar en CSS: la inclinación 3D
 * (useTilt) y la secuencia de arranque, que deben no ejecutarse en absoluto
 * en lugar de ejecutarse muy rápido.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
