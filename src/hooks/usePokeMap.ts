/* ==========================================================================
   Estado del mapa de avistamientos.

   Corrección importante respecto a la primera versión: el expediente de una
   zona ya NO depende del espécimen cargado. Antes se guardaba junto al
   `pokemonId` que lo había pedido y se descartaba al cambiar de Pokémon —
   justo lo que ocurre al pulsar una especie dentro del propio expediente,
   así que el panel se borraba en el momento del clic.

   Un expediente describe un LUGAR. Cambiar de espécimen no lo invalida.

   Ahora, además, la zona abierta vive en la URL (`?zona=99`), no en el
   estado del hook: el enlace es compartible y el botón Atrás del navegador
   cierra el expediente.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getEncounters, getZoneDossier } from '../services/pokeEncounters';
import * as pokeGeo from '../services/pokeGeo';
import { isAbortError } from '../services/pokeApi';
import type { EncounterZone, GeoLocation, ZoneDossier } from '../types/geo';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsePokeMap {
  geoReady: boolean;
  geoSize: number;
  backdrop: GeoLocation[];

  zones: EncounterZone[];
  zonesStatus: LoadStatus;
  zonesError: string | null;

  activeRegion: number | null;
  setActiveRegion: (index: number | null) => void;
  regionLocations: GeoLocation[];

  dossier: ZoneDossier | null;
  dossierStatus: LoadStatus;
  dossierError: string | null;
}

interface ZoneState {
  forId: number | null;
  status: LoadStatus;
  zones: EncounterZone[];
  error: string | null;
}

interface DossierState {
  /** Localización a la que pertenece. NO el espécimen: ese fue el error. */
  forLocation: number | null;
  status: LoadStatus;
  data: ZoneDossier | null;
  error: string | null;
}

const EMPTY_ZONES: EncounterZone[] = [];

/**
 * @param pokemonId  espécimen cargado, o null en modo exploración
 * @param zoneId     localización abierta, leída de la URL (`?zona=`)
 * @param enabled    el callejero cuesta 11 peticiones: no se descarga hasta
 *                   que el usuario abre el mapa por primera vez
 */
export function usePokeMap(
  pokemonId: number | null,
  zoneId: number | null,
  enabled: boolean,
): UsePokeMap {
  const [geoReady, setGeoReady] = useState(false);
  const [geoSize, setGeoSize] = useState(0);
  const [activeRegion, setActiveRegion] = useState<number | null>(null);

  const [zoneState, setZoneState] = useState<ZoneState>({
    forId: null,
    status: 'idle',
    zones: EMPTY_ZONES,
    error: null,
  });

  const [dossierState, setDossierState] = useState<DossierState>({
    forLocation: null,
    status: 'idle',
    data: null,
    error: null,
  });

  const zonesAbort = useRef<AbortController | null>(null);
  const dossierAbort = useRef<AbortController | null>(null);

  /* ── Callejero ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    void pokeGeo.load().then((ok) => {
      if (!alive) return;
      setGeoReady(ok);
      setGeoSize(pokeGeo.size());
    });

    return () => {
      alive = false;
    };
  }, [enabled]);

  const backdrop = useMemo(() => (geoReady ? pokeGeo.allLocations() : []), [geoReady]);

  const regionLocations = useMemo(
    () =>
      geoReady && activeRegion !== null ? pokeGeo.locationsOfRegion(activeRegion) : [],
    [geoReady, activeRegion],
  );

  /* ── Espécimen → localizaciones ───────────────────────────────────────── */

  useEffect(() => {
    if (!enabled || pokemonId === null || !geoReady) return;

    const controller = new AbortController();
    zonesAbort.current = controller;

    getEncounters(pokemonId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setZoneState({ forId: pokemonId, status: 'ready', zones: result, error: null });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setZoneState({
          forId: pokemonId,
          status: 'error',
          zones: EMPTY_ZONES,
          error: error instanceof Error ? error.message : 'No se pudo trazar el mapa',
        });
      });

    return () => controller.abort();
  }, [pokemonId, geoReady, enabled]);

  /* ── Localización → especies ──────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled || zoneId === null || !geoReady) return;

    const controller = new AbortController();
    dossierAbort.current = controller;

    getZoneDossier(zoneId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setDossierState({
          forLocation: zoneId,
          status: 'ready',
          data: result,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setDossierState({
          forLocation: zoneId,
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'No se pudo leer la zona',
        });
      });

    return () => controller.abort();
  }, [zoneId, geoReady, enabled]);

  useEffect(
    () => () => {
      zonesAbort.current?.abort();
      dossierAbort.current?.abort();
    },
    [],
  );

  /* ── Derivación ───────────────────────────────────────────────────────── */

  const zonesMatch = zoneState.forId === pokemonId;
  const dossierMatch = dossierState.forLocation === zoneId;

  return {
    geoReady,
    geoSize,
    backdrop,

    zones: zonesMatch ? zoneState.zones : EMPTY_ZONES,
    zonesStatus:
      pokemonId === null || !geoReady ? 'idle' : zonesMatch ? zoneState.status : 'loading',
    zonesError: zonesMatch ? zoneState.error : null,

    activeRegion,
    setActiveRegion,
    regionLocations,

    dossier: dossierMatch ? dossierState.data : null,
    dossierStatus: zoneId === null ? 'idle' : dossierMatch ? dossierState.status : 'loading',
    dossierError: dossierMatch ? dossierState.error : null,
  };
}
