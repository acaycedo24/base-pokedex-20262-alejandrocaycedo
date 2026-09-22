import { memo } from 'react';
import type { CSSProperties } from 'react';
import { formatDexId } from '../../utils/format';
import type { RecentEntry } from '../../types/pokemon';
import styles from './RecentSearches.module.css';

interface Props {
  recent: RecentEntry[];
  onChoose: (name: string) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
}

/**
 * Panel de búsquedas recientes (PRD FR-03).
 *
 * No forma parte del `listbox` del combobox a propósito: cada entrada lleva
 * su propio botón de borrado, y anidar controles dentro de un `role="option"`
 * los vuelve inalcanzables para los lectores de pantalla. Aquí son botones
 * normales, accesibles con Tab.
 */
function RecentSearchesImpl({ recent, onChoose, onRemove, onClear }: Props) {
  if (recent.length === 0) {
    return (
      <div className={styles.empty}>
        &gt;&gt; SIN REGISTROS PREVIOS — ESCRIBE PARA CONSULTAR EL ARCHIVO
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span>Consultas recientes</span>
        <button
          type="button"
          className={styles.clearAll}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          Purgar
        </button>
      </div>

      <ul>
        {recent.map((entry, index) => (
          <li
            key={entry.id}
            className={styles.item}
            style={{ '--delay': `${index * 30}ms` } as CSSProperties}
          >
            <button
              type="button"
              className={styles.pick}
              /* Se evita el blur del input para que el desplegable no se
                 cierre antes de que llegue el click. */
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(entry.name)}
            >
              {entry.sprite ? (
                <img
                  className={styles.sprite}
                  src={entry.sprite}
                  alt=""
                  width={34}
                  height={34}
                  loading="lazy"
                />
              ) : (
                <span className={styles.sprite} aria-hidden="true" />
              )}
              <span className={styles.meta}>
                <span className={styles.name}>{entry.displayName}</span>
                <span className={styles.dex}>{formatDexId(entry.id)}</span>
              </span>
            </button>

            <button
              type="button"
              className={styles.remove}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onRemove(entry.id)}
              aria-label={`Quitar ${entry.displayName} del historial`}
              title="Quitar del historial"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* El historial cambia muy poco —solo al buscar algo nuevo— mientras que su
   padre se renderiza en cada tecla. Es justo el caso para el que sirve
   `memo`. */
export const RecentSearches = memo(RecentSearchesImpl);
