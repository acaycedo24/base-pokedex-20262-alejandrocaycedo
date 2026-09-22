import styles from './ErrorPanel.module.css';

interface Props {
  kind: 'notfound' | 'error';
  message: string;
  onRetry: () => void;
}

/** Errores en lenguaje de terminal, nunca un volcado técnico (PRD FR-01). */
export function ErrorPanel({ kind, message, onRetry }: Props) {
  const isNotFound = kind === 'notfound';

  return (
    <div
      className={`${styles.root} ${isNotFound ? styles.notfound : styles.error}`}
      role="alert"
    >
      <p className={styles.code}>
        &gt;&gt; {isNotFound ? 'Espécimen no registrado' : 'Enlace interrumpido'}
      </p>
      <p className={styles.message}>{message}</p>
      <p className={styles.hint}>
        {isNotFound
          ? 'Revisa la grafía o usa el número de Pokédex.'
          : 'El archivo central no responde. Puedes reintentar la consulta.'}
      </p>

      {!isNotFound && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Reintentar conexión
        </button>
      )}
    </div>
  );
}
