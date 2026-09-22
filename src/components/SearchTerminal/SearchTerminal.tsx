import { memo, useCallback, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ChangeEvent } from 'react';
import { useAudio } from '../../hooks/useAudio';
import { useRecentSearches } from '../../hooks/useRecentSearches';
import { RecentSearches } from '../RecentSearches/RecentSearches';
import { SuggestionList } from '../SuggestionList/SuggestionList';
import type { UseSearchBox } from '../../hooks/useSearchBox';
import styles from './SearchTerminal.module.css';

interface Props {
  box: UseSearchBox;
  /** El padre decide qué significa elegir: aquí, navegar a su ruta. */
  onSelect: (name: string) => void;
  busy: boolean;
}

/**
 * Terminal de búsqueda: input + desplegable.
 *
 * Implementa el patrón ARIA combobox (PRD §6.6). El foco no sale nunca del
 * input mientras se navega la lista; la opción activa se comunica con
 * `aria-activedescendant`.
 *
 * Este componente no sabe qué ocurre al elegir un Pokémon: recibe `onSelect`
 * de su padre y lo llama. Esa es toda su relación con el resto de la
 * aplicación, y es lo que permite reutilizarlo sin arrastrar el Router.
 */
function SearchTerminalImpl({ box, onSelect, busy }: Props) {
  const { playKeyBlip } = useAudio();
  const { recent, remove, clear } = useRecentSearches();
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = useCallback((index: number) => `${baseId}-option-${index}`, [baseId]);

  const hasText = box.term.trim().length > 0;
  const showSuggestions = open && hasText;
  const showRecent = open && !hasText;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    /* `inputType` distingue escribir de borrar de forma fiable, incluso al
       pegar o al usar dictado, sin comparar longitudes a mano. */
    const inputType = (event.nativeEvent as InputEvent).inputType ?? '';
    playKeyBlip(inputType.startsWith('delete') ? 'delete' : 'type');

    box.setTerm(event.target.value);
    setOpen(true);
  };

  const choose = useCallback(
    (name: string) => {
      setOpen(false);
      onSelect(name);
      inputRef.current?.focus();
    },
    [onSelect],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else box.moveHighlight(1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        else box.moveHighlight(-1);
        break;

      case 'Enter': {
        event.preventDefault();
        const target = box.resolveSubmit();
        setOpen(false);
        if (target) onSelect(target);
        break;
      }

      case 'Tab': {
        // Tab confirma la sugerencia marcada y deja que el foco siga su curso.
        const chosen = box.suggestions[box.highlightedIndex];
        if (open && chosen) {
          event.preventDefault();
          choose(chosen.name);
        } else {
          setOpen(false);
        }
        break;
      }

      case 'Escape':
        /* Primer Escape cierra el desplegable; el segundo, ya cerrado,
           limpia la consulta. */
        if (open) setOpen(false);
        else box.reset();
        break;

      default:
        break;
    }
  };

  /* El desplegable solo se cierra cuando el foco abandona el componente
     entero, no al pasar del input a un botón interno del panel. */
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    setOpen(false);
  };

  const activeId =
    showSuggestions && box.highlightedIndex >= 0
      ? optionId(box.highlightedIndex)
      : undefined;

  return (
    <div className={styles.root} ref={rootRef} onBlur={handleBlur}>
      <div className={styles.field}>
        <span className={styles.prompt} aria-hidden="true">
          &gt;&gt;
        </span>

        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={box.term}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Identificar espécimen…"
          aria-label="Buscar Pokémon por nombre o número de Pokédex"
          role="combobox"
          aria-expanded={open}
          /* Solo se referencia el listbox cuando existe de verdad: al mostrar
             recientes el desplegable no es una lista de opciones. */
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
        />

        {busy && <span className={styles.busy} aria-hidden="true" />}

        {hasText && !busy && (
          <button
            type="button"
            className={styles.clear}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              box.reset();
              inputRef.current?.focus();
            }}
            aria-label="Limpiar la consulta"
          >
            ✕
          </button>
        )}
      </div>

      <div className={styles.status}>
        <span>
          {box.indexReady
            ? `Índice local · ${box.indexSize} especímenes`
            : 'Sincronizando índice…'}
        </span>
        {box.mode === 'remote' && <span className={styles.statusAlert}>Modo remoto</span>}
      </div>

      {(showSuggestions || showRecent) && (
        <div className={styles.popup}>
          {showSuggestions ? (
            <SuggestionList
              suggestions={box.suggestions}
              highlightedIndex={box.highlightedIndex}
              listboxId={listboxId}
              optionId={optionId}
              onHighlight={box.setHighlightedIndex}
              onChoose={choose}
            />
          ) : (
            <RecentSearches
              recent={recent}
              onChoose={choose}
              onRemove={remove}
              onClear={clear}
            />
          )}
        </div>
      )}
    </div>
  );
}

export const SearchTerminal = memo(SearchTerminalImpl);
