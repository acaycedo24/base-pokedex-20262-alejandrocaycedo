import styles from '../components/Layout/Layout.module.css';

/** Ruta `/`. Solo presentación: no tiene estado ni efectos. */
export function HomePage() {
  return (
    <div className={styles.intro}>
      <h1 className={styles.introTitle}>Archivo de especímenes</h1>
      <p className={styles.introText}>
        Introduce un nombre o un número de Pokédex para iniciar el análisis
      </p>
      <p className={styles.hint}>
        ↑ ↓ para navegar · Enter para analizar · Esc para limpiar
      </p>
    </div>
  );
}
