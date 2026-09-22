import { useAudio } from '../../hooks/useAudio';
import styles from './AudioToggle.module.css';

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M17 9l4 6M21 9l-4 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M16.5 9.5a3.5 3.5 0 010 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M19 7a7 7 0 010 10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** Interruptor de silencio y volumen. Su preferencia persiste (PRD FR-07). */
export function AudioToggle() {
  const { muted, toggleMute, volume, setVolume, supported } = useAudio();

  // Sin Web Audio no hay nada que controlar: el control se oculta entero.
  if (!supported) return null;

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.button}
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
        title={muted ? 'Activar sonido' : 'Silenciar sonido'}
      >
        <SpeakerIcon muted={muted} />
      </button>

      <span className={styles.label} aria-hidden="true">
        {muted ? 'Mudo' : 'Audio'}
      </span>

      <input
        type="range"
        className={styles.slider}
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={muted}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volumen"
      />
    </div>
  );
}
