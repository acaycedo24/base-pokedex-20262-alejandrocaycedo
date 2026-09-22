import type { ReactNode } from 'react';
import { RecentContextProvider, useRecentEngine } from '../hooks/useRecentSearches';

interface Props {
  children: ReactNode;
}

/**
 * Único punto donde se instancia el historial de búsquedas.
 *
 * Se usa Context en lugar de pasar props porque quien lo escribe (la página
 * del espécimen, al final del árbol) y quien lo lee (el panel de recientes
 * del buscador, en otra rama) están muy separados. Pasarlo por props
 * obligaría a atravesar media aplicación con datos que las capas
 * intermedias no usan — lo que se suele llamar *prop drilling*.
 */
export function RecentProvider({ children }: Props) {
  const recent = useRecentEngine();
  return <RecentContextProvider value={recent}>{children}</RecentContextProvider>;
}
