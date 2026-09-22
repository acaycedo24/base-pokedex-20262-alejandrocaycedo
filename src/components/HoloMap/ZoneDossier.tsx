import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { ZoneDossier as Dossier } from '../../types/geo';
import styles from './ZoneDossier.module.css';

interface Props {
  dossier: Dossier;
  onClose: () => void;
  onSelectPokemon: (name: string) => void;
}

/* Los sprites pequeños viven en el repositorio de PokeAPI bajo una ruta
   predecible por id. Usarla ahorra una petición a la API por cada especie
   listada, que en una zona poblada serían decenas. */
const spriteUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

/** Expediente de una zona: qué especies la habitan (dirección inversa). */
function ZoneDossierImpl({ dossier, onClose, onSelectPokemon }: Props) {
  return (
    <div className={styles.root}>
      <header className={styles.head}>
        <div>
          <p className={styles.region}>{dossier.regionLabel}</p>
          <h3 className={styles.name}>{dossier.label}</h3>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Cerrar el expediente de la zona"
        >
          ✕
        </button>
      </header>

      {dossier.truncated && (
        <p className={styles.note}>
          &gt;&gt; Lectura parcial: la zona tiene más sectores de los que se
          consultan de una vez
        </p>
      )}

      {dossier.occupants.length === 0 ? (
        <p className={styles.empty}>
          &gt;&gt; Sin especies registradas en esta zona
        </p>
      ) : (
        <div className={styles.grid}>
          {dossier.occupants.map((occupant, index) => (
            <button
              key={occupant.name}
              type="button"
              className={styles.occupant}
              style={{ '--delay': `${Math.min(index, 20) * 25}ms` } as CSSProperties}
              onClick={() => onSelectPokemon(occupant.name)}
              title={`Analizar ${occupant.displayName}`}
            >
              <img
                className={styles.sprite}
                src={spriteUrl(occupant.id)}
                alt=""
                width={38}
                height={38}
                loading="lazy"
                /* Formas alternas y especies recientes pueden no tener sprite
                   en esa ruta; se oculta la imagen en vez de dejar el icono
                   de imagen rota. */
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
              <span className={styles.info}>
                <span className={styles.occupantName}>{occupant.displayName}</span>
                <span className={styles.chance}>
                  {occupant.maxChance > 0 ? `${occupant.maxChance}%` : '—'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Puede listar decenas de especies con su sprite. Redibujarlo cada vez que
   el mapa cambia de estado sería trabajo tirado. */
export const ZoneDossier = memo(ZoneDossierImpl);
