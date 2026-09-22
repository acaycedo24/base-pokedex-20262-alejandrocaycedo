import { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Inclinación 3D reactiva al puntero (ARCHITECTURE.md §ADR-06).
 *
 * El puntero emite eventos a 60–120 Hz. Llevar eso a `useState`
 * re-renderizaría la ficha entera en cada movimiento, así que el hook escribe
 * custom properties directamente sobre el nodo y agrupa las escrituras en un
 * `requestAnimationFrame`: React no participa en la animación y hay
 * exactamente una escritura por cuadro.
 *
 * Devuelve un ref inerte —sin listeners— cuando el usuario pide movimiento
 * reducido o el dispositivo no tiene puntero fino.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 9) {
  const ref = useRef<T>(null);
  const frame = useRef(0);
  const reduced = useReducedMotion();

  const reset = useCallback((node: T) => {
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
    node.style.setProperty('--glare-opacity', '0');
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Sin puntero fino la inclinación no aporta nada y estorba al desplazarse.
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduced || !finePointer) {
      reset(node);
      return;
    }

    let pendingX = 0;
    let pendingY = 0;

    const apply = () => {
      frame.current = 0;
      node.style.setProperty('--tilt-x', `${pendingX}deg`);
      node.style.setProperty('--tilt-y', `${pendingY}deg`);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      // Coordenadas normalizadas al rango [-0.5, 0.5] desde el centro.
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;

      // El eje X rota según la posición vertical, y viceversa: es lo que hace
      // que la tarjeta "mire" hacia el cursor en lugar de huir de él.
      pendingX = -py * maxDeg * 2;
      pendingY = px * maxDeg * 2;

      node.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`);
      node.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`);

      if (frame.current === 0) frame.current = requestAnimationFrame(apply);
    };

    const onEnter = () => node.style.setProperty('--glare-opacity', '1');
    const onLeave = () => {
      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      reset(node);
    };

    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
    };
  }, [maxDeg, reduced, reset]);

  return ref;
}
