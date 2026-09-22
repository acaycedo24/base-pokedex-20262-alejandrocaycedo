import { memo } from 'react';
import type { CSSProperties } from 'react';
import { formatDexId } from '../../utils/format';
import type { Suggestion } from '../../types/pokemon';
import styles from './SuggestionList.module.css';

interface Props {
  suggestions: Suggestion[];
  highlightedIndex: number;
  listboxId: string;
  optionId: (index: number) => string;
  onHighlight: (index: number) => void;
  onChoose: (name: string) => void;
}

/** Parte la etiqueta en tres para resaltar el fragmento que coincide. */
function Label({ suggestion }: { suggestion: Suggestion }) {
  const { label, matchStart, matchEnd } = suggestion;

  if (matchStart < 0 || matchEnd <= matchStart) return <>{label}</>;

  return (
    <>
      {label.slice(0, matchStart)}
      <span className={styles.match}>{label.slice(matchStart, matchEnd)}</span>
      {label.slice(matchEnd)}
    </>
  );
}

/**
 * Lista de autocompletado. Implementa el rol `listbox` del patrón combobox:
 * las opciones no reciben foco —lo conserva el input— y el elemento activo se
 * comunica al lector de pantalla con `aria-activedescendant` desde
 * SearchTerminal.
 */
function SuggestionListImpl({
  suggestions,
  highlightedIndex,
  listboxId,
  optionId,
  onHighlight,
  onChoose,
}: Props) {
  if (suggestions.length === 0) {
    return (
      <div className={styles.empty} id={listboxId} role="listbox" aria-label="Sugerencias">
        &gt;&gt; SIN COINCIDENCIAS EN EL ÍNDICE
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <div className={styles.header} aria-hidden="true">
        <span>Coincidencias</span>
        <span>{suggestions.length}</span>
      </div>

      <ul id={listboxId} role="listbox" aria-label="Sugerencias">
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.name}
            id={optionId(index)}
            role="option"
            aria-selected={index === highlightedIndex}
            className={`${styles.option} ${index === highlightedIndex ? styles.active : ''}`}
            style={{ '--delay': `${index * 25}ms` } as CSSProperties}
            /* `mousedown` y no `click`: el click llega después del blur del
               input, que ya habría cerrado el desplegable. */
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(suggestion.name);
            }}
            onMouseEnter={() => onHighlight(index)}
          >
            <span className={styles.dex}>{formatDexId(suggestion.id)}</span>
            <span className={styles.name}>
              <Label suggestion={suggestion} />
            </span>
            <span className={styles.enter} aria-hidden="true">
              ⏎
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Se vuelve a renderizar solo si cambian las sugerencias o la opción
   marcada. Sin `memo`, cada pulsación de tecla la redibujaría aunque la
   lista fuera idéntica, porque su padre sí cambia de estado. */
export const SuggestionList = memo(SuggestionListImpl);
