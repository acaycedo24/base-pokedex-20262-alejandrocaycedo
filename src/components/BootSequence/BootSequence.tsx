import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './BootSequence.module.css';

interface Props {
  onDone: () => void;
  /** Visita repetida: la secuencia se acorta en lugar de repetirse entera. */
  short: boolean;
}

const LINES = [
  '>> POKESEARCH v1.0 — TERMINAL DE ARCHIVO',
  '>> INICIALIZANDO NÚCLEO HOLOGRÁFICO...',
  '>> CONECTANDO A ARCHIVO CENTRAL (pokeapi.co)...',
  '>> VERIFICANDO ÍNDICE DE ESPECÍMENES...',
  '>> CALIBRANDO SENSORES ACÚSTICOS...',
  '>> SISTEMA LISTO',
];

/**
 * Secuencia de arranque retro (PRD §6.4).
 *
 * Reglas del producto que condicionan la implementación: dura como mucho
 * 1.8 s, se puede saltar con cualquier tecla o clic, y en la segunda visita
 * se reduce a las dos últimas líneas. Con movimiento reducido no se muestra
 * en absoluto: una pantalla que parpadea no se arregla haciéndola más rápida.
 */
export function BootSequence({ onDone, short }: Props) {
  const reduced = useReducedMotion();
  const lines = short ? LINES.slice(-2) : LINES;
  const stepMs = short ? 220 : Math.floor(1800 / LINES.length);

  const [visible, setVisible] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    window.setTimeout(onDone, 260); // deja correr el fundido de salida
  }, [onDone]);

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }

    const interval = window.setInterval(() => {
      setVisible((prev) => {
        if (prev + 1 >= lines.length) {
          window.clearInterval(interval);
          window.setTimeout(finish, 320);
        }
        return prev + 1;
      });
    }, stepMs);

    /* Saltable con cualquier interacción: en la segunda visita nadie quiere
       volver a ver esto entero. */
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [finish, lines.length, onDone, reduced, stepMs]);

  if (reduced) return null;

  return (
    <div
      className={`${styles.root} ${leaving ? styles.leaving : ''}`}
      role="status"
      aria-live="polite"
    >
      {lines.slice(0, visible).map((line, index) => (
        <p key={line} className={`${styles.line} ${index === lines.length - 1 ? styles.ok : ''}`}>
          {line}
          {index === visible - 1 && <span className={styles.caret} aria-hidden="true" />}
        </p>
      ))}

      <p className={styles.skip} aria-hidden="true">
        Pulsa cualquier tecla para omitir
      </p>
    </div>
  );
}
