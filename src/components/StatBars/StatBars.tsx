import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAT_CEILING } from '../../types/pokemon';
import type { PokemonStat } from '../../types/pokemon';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './StatBars.module.css';

interface Props {
  stats: PokemonStat[];
}

const COUNT_MS = 900;

/** Conteo ascendente hasta `target`, con salida en un solo paso si el usuario
 *  pidió movimiento reducido. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      // Misma curva que la barra (ease-out) para que cifra y relleno lleguen juntos.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, enabled]);

  /* Con movimiento reducido se devuelve la cifra final directamente en lugar
     de escribirla en el estado desde un efecto: el valor es derivable, así
     que no necesita un render extra. */
  return enabled ? value : target;
}

function StatRow({ stat, index, animate }: { stat: PokemonStat; index: number; animate: boolean }) {
  const shown = useCountUp(stat.value, animate);
  const ratio = Math.min(1, stat.value / STAT_CEILING);
  const over = stat.value > STAT_CEILING;

  return (
    <div className={`${styles.row} ${over ? styles.over : ''}`}>
      <span className={styles.label}>{stat.label}</span>

      <div
        className={styles.track}
        role="meter"
        aria-label={stat.label}
        aria-valuenow={stat.value}
        aria-valuemin={0}
        aria-valuemax={255}
      >
        <span
          className={styles.fill}
          style={{ '--fill': ratio, '--delay': `${index * 70}ms` } as CSSProperties}
        />
      </div>

      <span className={styles.value}>{shown}</span>
    </div>
  );
}

/** Seis estadísticas base con barras y conteo escalonados (PRD FR-04). */
function StatBarsImpl({ stats }: Props) {
  const reduced = useReducedMotion();

  return (
    <div className={styles.root}>
      {stats.map((stat, index) => (
        <StatRow key={stat.key} stat={stat} index={index} animate={!reduced} />
      ))}
    </div>
  );
}

/* Seis contadores animados por `requestAnimationFrame`: no conviene que se
   reinicien porque un ancestro se haya renderizado. */
export const StatBars = memo(StatBarsImpl);
