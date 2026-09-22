import { Link, useLocation } from 'react-router-dom';
import styles from '../components/Layout/Layout.module.css';

/** Ruta comodín `*`: una URL que no corresponde a ningún componente. */
export function NotFoundPage() {
  const location = useLocation();

  return (
    <div className={styles.intro}>
      <h1 className={styles.introTitle}>Ruta desconocida</h1>
      <p className={styles.introText}>
        &gt;&gt; El sector <code>{location.pathname}</code> no existe en este archivo
      </p>
      <p className={styles.hint}>
        <Link to="/">Volver a la terminal</Link>
      </p>
    </div>
  );
}
