import { ErrorPanel } from '../components/ErrorPanel/ErrorPanel';
import { RadarLoader } from '../components/RadarLoader/RadarLoader';
import { SpecimenCard } from '../components/SpecimenCard/SpecimenCard';
import { useShell } from '../components/Layout/shellContext';

/**
 * Ruta `/pokemon/:name`.
 *
 * No carga nada por su cuenta: recibe el espécimen del layout a través del
 * Outlet. Así, al pasar de la ficha al mapa y volver, no se repite la
 * petición ni se vuelve a oír el grito.
 */
export function SpecimenPage() {
  const { pokemon, status, error, retry } = useShell();

  if (status === 'loading') return <RadarLoader />;

  if ((status === 'notfound' || status === 'error') && error) {
    return (
      <ErrorPanel
        kind={status === 'notfound' ? 'notfound' : 'error'}
        message={error}
        onRetry={retry}
      />
    );
  }

  if (!pokemon) return null;

  /* La clave remonta la ficha al cambiar de espécimen: sin ella, React
     reutilizaría la instancia y las animaciones de entrada y de
     estadísticas no volverían a correr. */
  return <SpecimenCard key={pokemon.id} pokemon={pokemon} />;
}
