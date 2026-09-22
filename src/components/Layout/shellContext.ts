import { useOutletContext } from 'react-router-dom';
import type { UsePokemon } from '../../hooks/usePokemon';

/**
 * Lo que el layout entrega a la página activa a través del `<Outlet/>`.
 *
 * Es la alternativa del Router al paso de props: el layout es el padre y las
 * páginas son sus hijas, pero entre ambos está `<Outlet/>`, así que no se
 * pueden pasar props directamente.
 *
 * Vive en su propio archivo y no junto al componente porque Vite solo aplica
 * Fast Refresh a los módulos que exportan exclusivamente componentes.
 */
export type ShellContext = UsePokemon;

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
