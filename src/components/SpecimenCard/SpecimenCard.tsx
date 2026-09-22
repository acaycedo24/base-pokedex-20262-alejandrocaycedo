import { memo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAudio } from '../../hooks/useAudio';
import { useTilt } from '../../hooks/useTilt';
import { formatDexId } from '../../utils/format';
import { StatBars } from '../StatBars/StatBars';
import type { Pokemon } from '../../types/pokemon';
import styles from './SpecimenCard.module.css';

interface Props {
  pokemon: Pokemon;
}

/**
 * Ficha del espécimen (PRD FR-04).
 *
 * Tiñe la interfaz entera: reescribe `--c-accent` con el color del tipo
 * primario en su propio ámbito, y como el fondo y el buscador se pintan a
 * partir de ese token, toda la terminal adopta el color del Pokémon en curso.
 */
function SpecimenCardImpl({ pokemon }: Props) {
  const tiltRef = useTilt<HTMLElement>(8);
  const { playCry } = useAudio();
  const [artFailed, setArtFailed] = useState(false);

  const primary = pokemon.types[0]?.color ?? 'var(--c-cyan)';
  const image = artFailed || !pokemon.sprite ? pokemon.spriteFallback : pokemon.sprite;

  return (
    <div
      className={styles.stage}
      /* El acento se define aquí y no en `:root` para que la transición de
         color ocurra al cambiar de espécimen sin tocar estado global. */
      style={{ '--c-accent': primary } as CSSProperties}
    >
      <article
        ref={tiltRef}
        className={styles.card}
        aria-label={`Ficha de ${pokemon.displayName}`}
      >
        <header className={styles.head}>
          <div>
            <span className={styles.dex}>{formatDexId(pokemon.id)}</span>
            <h2 className={styles.name}>{pokemon.displayName}</h2>
          </div>

          <button
            type="button"
            className={styles.cryButton}
            onClick={() => void playCry(pokemon.cries)}
          >
            <span aria-hidden="true">◈</span> Repetir grito
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.art}>
            <span className={styles.artGlow} aria-hidden="true" />
            {image ? (
              <img
                className={styles.sprite}
                src={image}
                alt={pokemon.displayName}
                width={230}
                height={230}
                onError={() => setArtFailed(true)}
              />
            ) : (
              <span className={styles.sprite} aria-hidden="true" />
            )}
          </div>

          <div className={styles.panel}>
            <ul className={styles.types}>
              {pokemon.types.map((type) => (
                <li
                  key={type.name}
                  className={styles.type}
                  style={{ '--type-color': type.color } as CSSProperties}
                >
                  {type.label}
                </li>
              ))}
            </ul>

            <div className={styles.metrics}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Altura</span>
                <span className={styles.metricValue}>
                  {pokemon.heightM.toFixed(1)} m
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Peso</span>
                <span className={styles.metricValue}>
                  {pokemon.weightKg.toFixed(1)} kg
                </span>
              </div>
            </div>

            <div>
              <p className={styles.sectionLabel}>Habilidades</p>
              <ul className={styles.abilities}>
                {pokemon.abilities.map((ability) => (
                  <li
                    key={ability.name}
                    className={`${styles.ability} ${ability.hidden ? styles.hidden : ''}`}
                    title={ability.hidden ? 'Habilidad oculta' : undefined}
                  >
                    {ability.name}
                    {ability.hidden && ' ·oculta'}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className={styles.sectionLabel}>Estadísticas base</p>
              {/* La clave fuerza el remontaje al cambiar de espécimen: sin
                  ella las barras conservarían su estado y no volverían a
                  animarse. */}
              <StatBars key={pokemon.id} stats={pokemon.stats} />
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

/* La ficha solo depende de `pokemon`. `memo` compara esa prop por identidad
   y, como el objeto viene de la caché y no se recrea, el ahorro es real. */
export const SpecimenCard = memo(SpecimenCardImpl);
