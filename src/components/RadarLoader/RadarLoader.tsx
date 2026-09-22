import type { CSSProperties } from 'react';
import styles from './RadarLoader.module.css';

/** Barrido de radar mientras se adquiere un espécimen (PRD §6.4). */
export function RadarLoader() {
  return (
    <div className={styles.root} role="status" aria-live="polite">
      <div className={styles.radar} aria-hidden="true">
        <span className={styles.reticle} />
        <span className={styles.sweep} />
        <span className={styles.ping} />
        <span className={styles.ping} style={{ '--delay': '1s' } as CSSProperties} />
      </div>
      <p className={styles.caption}>&gt;&gt; Adquiriendo señal del espécimen…</p>
    </div>
  );
}
