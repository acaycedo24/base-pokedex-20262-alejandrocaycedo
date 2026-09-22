import { memo } from 'react';
import type { CSSProperties } from 'react';
import styles from './HoloBackground.module.css';

const PARTICLE_COUNT = 28;

/* Las posiciones se sortean una sola vez al cargar el módulo, no en el
   render. Sortearlas dentro del componente —aunque fuera en un `useMemo`—
   introduciría impureza en el render, y en StrictMode las partículas
   saltarían de sitio al montar dos veces. */
const PARTICLES: CSSProperties[] = Array.from({ length: PARTICLE_COUNT }, () => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  '--drift-x': `${(Math.random() - 0.5) * 120}px`,
  '--drift-y': `${-40 - Math.random() * 160}px`,
  '--dur': `${12 + Math.random() * 16}s`,
  '--delay': `${-Math.random() * 20}s`,
  opacity: 0.15 + Math.random() * 0.4,
}) as CSSProperties);

/**
 * Fondo de la terminal: rejilla en perspectiva, horizonte, partículas de
 * datos, líneas de escaneo CRT y viñeta.
 *
 * Se tiñe solo: todas las capas se pintan a partir de `--c-accent`, que
 * SpecimenCard reescribe con el color del tipo del espécimen cargado. Este
 * componente no necesita saber qué Pokémon hay en pantalla.
 */
function HoloBackgroundImpl() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.grid} />
      <div className={styles.horizon} />

      <div className={styles.particles}>
        {PARTICLES.map((style, i) => (
          <span key={i} className={styles.particle} style={style} />
        ))}
      </div>

      <div className={styles.scanlines} />
      <div className={styles.vignette} />
    </div>
  );
}

/* No recibe props: `memo` lo congela tras el primer render. Importa porque
   contiene 28 partículas animadas que no deben reiniciarse al navegar. */
export const HoloBackground = memo(HoloBackgroundImpl);
