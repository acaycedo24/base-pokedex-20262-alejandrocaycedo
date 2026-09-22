import { useCallback, useEffect } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AudioToggle } from '../AudioToggle/AudioToggle';
import { SearchTerminal } from '../SearchTerminal/SearchTerminal';
import { usePokemon } from '../../hooks/usePokemon';
import { useSearchBox } from '../../hooks/useSearchBox';
import { normalizeTerm, toDisplayName } from '../../utils/format';
import type { ShellContext } from './shellContext';
import styles from './Layout.module.css';

/**
 * Marco de la aplicación: cabecera, buscador, pestañas y hueco para la
 * página activa.
 *
 * Es la única ruta que nunca se desmonta, y por eso es el sitio correcto
 * para el buscador: navegar entre la ficha y el mapa no pierde el texto
 * escrito ni el índice cargado.
 */
export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const box = useSearchBox();

  /* El espécimen activo lo dice la URL, no el estado de ningún componente.
     `/pokemon/:name/*` cubre tanto la ficha como su mapa. */
  const match = useMatch('/pokemon/:name/*');
  const routeName = match?.params.name ?? undefined;

  const specimen = usePokemon(routeName);

  const onMapRoute = location.pathname.endsWith('/mapa');
  const fichaHref = routeName ? `/pokemon/${routeName}` : '/';
  const mapaHref = routeName ? `/pokemon/${routeName}/mapa` : '/mapa';

  const { syncTerm } = box;

  /* ── Efecto: la URL manda sobre el campo de búsqueda ────────────────────
     Al entrar por un enlace directo a /pokemon/pikachu, el input debe
     mostrar "Pikachu". Sincroniza un sistema externo (la barra de
     direcciones) con el estado local, que es justo para lo que sirve
     useEffect. Solo se dispara cuando cambia el parámetro de la ruta, así
     que no interfiere mientras se teclea. */
  useEffect(() => {
    if (routeName) syncTerm(toDisplayName(routeName));
  }, [routeName, syncTerm]);

  /* `useCallback` mantiene la identidad de la función entre renders. Sin él,
     SearchTerminal —que está envuelto en `memo`— recibiría una prop nueva en
     cada render del layout y se volvería a renderizar igualmente, dejando el
     `memo` sin efecto. */
  const handleSelect = useCallback(
    (name: string) => {
      const slug = normalizeTerm(name);
      if (!slug) return;
      /* navigate() cambia la URL sin recargar la página: es la diferencia
         entre una SPA y un sitio clásico. El texto del buscador, el índice en
         memoria, el historial y el AudioContext sobreviven al cambio de vista.
         Se conserva la pestaña en la que estaba el usuario. */
      navigate(`/pokemon/${slug}${onMapRoute ? '/mapa' : ''}`);
    },
    [navigate, onMapRoute],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.hud}>
        <Link to="/" className={styles.brand}>
          <span className={styles.wordmark}>
            Poke<span className={styles.wordmarkAccent}>Search</span>
          </span>
          <span className={styles.tag}>Terminal de archivo · v1.1</span>
        </Link>
        <AudioToggle />
      </header>

      <main className={`${styles.main} ${routeName ? styles.stageActive : styles.stageIdle}`}>
        <SearchTerminal
          box={box}
          onSelect={handleSelect}
          busy={specimen.status === 'loading'}
        />

        <nav className={styles.tabs} role="tablist" aria-label="Vista de la terminal">
          <Link
            to={fichaHref}
            role="tab"
            className={styles.tab}
            aria-selected={!onMapRoute}
          >
            Ficha
          </Link>
          <Link to={mapaHref} role="tab" className={styles.tab} aria-selected={onMapRoute}>
            Mapa de avistamientos
          </Link>
        </nav>

        {/* Aquí se monta la página que corresponde a la URL actual. */}
        <Outlet context={specimen satisfies ShellContext} />
      </main>

      <footer className={styles.foot}>
        Datos suministrados por PokeAPI · Sin afiliación con Nintendo ni Game Freak
      </footer>
    </div>
  );
}
