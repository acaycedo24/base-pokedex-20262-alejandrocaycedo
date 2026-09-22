import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HoloMap } from '../components/HoloMap/HoloMap';
import { useShell } from '../components/Layout/shellContext';
import { usePokeMap } from '../hooks/usePokeMap';
import { normalizeTerm } from '../utils/format';

/**
 * Rutas `/mapa` y `/pokemon/:name/mapa`.
 *
 * La zona abierta vive en la URL como `?zona=99`, no en el estado del
 * componente. Tres consecuencias prácticas:
 *   · el enlace a una zona concreta es compartible;
 *   · el botón Atrás del navegador cierra el expediente;
 *   · elegir una especie dentro del expediente ya no lo borra, que era el
 *     fallo de la versión anterior.
 */
export function MapPage() {
  const navigate = useNavigate();
  const { pokemon } = useShell();
  const [params, setParams] = useSearchParams();

  const rawZone = params.get('zona');
  const zoneId = rawZone !== null && /^\d+$/.test(rawZone) ? Number(rawZone) : null;

  /* El callejero se descarga al montar esta página, no al arrancar la
     aplicación: quien solo use el buscador no paga esas 11 peticiones. */
  const map = usePokeMap(pokemon?.id ?? null, zoneId, true);

  const openZone = useCallback(
    (locationId: number) => {
      // `replace` evita llenar el historial al saltar de zona en zona.
      setParams({ zona: String(locationId) }, { replace: true });
    },
    [setParams],
  );

  const closeZone = useCallback(() => {
    setParams({}, { replace: true });
  }, [setParams]);

  /* Elegir una especie del expediente navega a su mapa. El expediente sigue
     abierto porque depende de `?zona=`, que no cambia. */
  const selectPokemon = useCallback(
    (name: string) => {
      const slug = normalizeTerm(name);
      if (!slug) return;
      const suffix = zoneId === null ? '' : `?zona=${zoneId}`;
      navigate(`/pokemon/${slug}/mapa${suffix}`);
    },
    [navigate, zoneId],
  );

  return (
    <HoloMap
      map={map}
      pokemonName={pokemon?.displayName ?? null}
      onOpenZone={openZone}
      onCloseZone={closeZone}
      onSelectPokemon={selectPokemon}
    />
  );
}
