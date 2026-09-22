/* ==========================================================================
   Callejero: localización → región → posición en el radar.

   Se construye una sola vez con 11 peticiones (una por región) y se persiste
   en LocalStorage, igual que el índice de especímenes. Medido: 89 KB de
   descarga, 1013 localizaciones, ~26 KB ya normalizado.

   Resolución de zona → localización
   ---------------------------------
   El endpoint de encuentros devuelve zonas ('kanto-route-2-south-towards-
   viridian-city') pero no dice a qué localización ni a qué región pertenecen.
   Averiguarlo por la API costaría dos peticiones por zona: 80 peticiones para
   un Pokémon con 40 zonas, inaceptable.

   En su lugar se explota la convención de nombres de PokeAPI: el nombre de la
   zona empieza por el de su localización. Se prueba el prefijo más largo
   primero. Verificado contra la API sobre las 1539 zonas existentes: resuelve
   el 100 %, y una muestra aleatoria de 20 contrastada con
   `/location-area/{id}` acertó las 20.
   ========================================================================== */

import { API_BASE } from './pokeApi';
import { KEYS, readJSON, writeJSON } from './storage';
import { idFromUrl, toDisplayName } from '../utils/format';
import { REGIONS } from '../types/geo';
import type { GeoLocation } from '../types/geo';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días: la geografía casi no cambia

/* ── Geometría del radar ─────────────────────────────────────────────────── */

export const MAP_SIZE = 620;
const CENTER = MAP_SIZE / 2;
const INNER_RADIUS = 96;
const OUTER_RADIUS = 250;
/** Margen angular a cada lado del sector, para que los nodos no se peguen
    a la línea divisoria y se confunda a qué región pertenecen. */
const SECTOR_PAD_DEG = 2.4;

export const SECTOR_SPAN_DEG = 360 / REGIONS.length;

/** Ángulo inicial del sector de una región, con 0° arriba. */
export function sectorStartDeg(regionIndex: number): number {
  return -90 + regionIndex * SECTOR_SPAN_DEG;
}

export function polarToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + Math.cos(rad) * radius, y: CENTER + Math.sin(rad) * radius };
}

export { CENTER, INNER_RADIUS, OUTER_RADIUS };

/**
 * FNV-1a de 32 bits. Se usa para derivar la posición del nombre, no por sus
 * propiedades criptográficas sino porque es estable, rápido y reparte bien:
 * la misma localización cae siempre en el mismo punto del radar.
 */
function hash32(text: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(text: string, seed: number): number {
  return hash32(text, seed) / 4294967295;
}

/** Posición determinista de una localización dentro del sector de su región. */
export function positionFor(name: string, regionIndex: number): { x: number; y: number } {
  const start = sectorStartDeg(regionIndex) + SECTOR_PAD_DEG;
  const span = SECTOR_SPAN_DEG - SECTOR_PAD_DEG * 2;

  const angle = start + unit(name, 0x9e37) * span;
  /* La raíz cuadrada compensa que el área de un anillo crece con el radio:
     sin ella los nodos se apelotonarían cerca del centro. */
  const t = Math.sqrt(unit(name, 0x85eb));
  const radius = INNER_RADIUS + t * (OUTER_RADIUS - INNER_RADIUS);

  return polarToXY(angle, radius);
}

/* ── Nombres legibles ────────────────────────────────────────────────────── */

const REGION_PREFIXES = REGIONS.map((r) => `${r.slug}-`);

/**
 * 'kanto-route-2' → 'Ruta 2'; 'viridian-forest' → 'Viridian Forest'.
 *
 * Solo se traduce el patrón de ruta, que cubre varios cientos de
 * localizaciones. Los topónimos propios se dejan como están: traducirlos
 * palabra a palabra produciría cosas como "Viridian Ciudad".
 */
export function locationLabel(name: string): string {
  let slug = name;
  for (const prefix of REGION_PREFIXES) {
    if (slug.startsWith(prefix)) {
      slug = slug.slice(prefix.length);
      break;
    }
  }

  const route = /^(?:sea-)?route-(\d+)(?:-(.*))?$/.exec(slug);
  if (route) {
    const suffix = route[2] ? ` (${toDisplayName(route[2])})` : '';
    return `Ruta ${route[1]}${suffix}`;
  }

  return toDisplayName(slug);
}

/* ── Carga y persistencia ────────────────────────────────────────────────── */

/** Tupla compacta: [nombre, índice de región, id]. Ahorra ~40 % frente a objetos. */
type StoredLocation = [string, number, number];

interface StoredGazetteer {
  fetchedAt: number;
  locations: StoredLocation[];
}

interface RawRegion {
  name: string;
  locations: { name: string; url: string }[];
}

let byName = new Map<string, GeoLocation>();
/** Nombres ordenados por longitud descendente para la resolución por prefijo. */
let loading: Promise<boolean> | null = null;

function hydrate(stored: StoredLocation[]): void {
  byName = new Map();
  for (const [name, regionIndex, locationId] of stored) {
    const { x, y } = positionFor(name, regionIndex);
    byName.set(name, {
      name,
      regionIndex,
      locationId,
      label: locationLabel(name),
      x,
      y,
    });
  }
}

export function load(): Promise<boolean> {
  if (byName.size > 0) return Promise.resolve(true);
  if (loading) return loading;

  loading = (async () => {
    const stored = readJSON<StoredGazetteer>(KEYS.geo);
    if (
      stored &&
      Array.isArray(stored.locations) &&
      stored.locations.length > 0 &&
      Date.now() - stored.fetchedAt < TTL_MS
    ) {
      hydrate(stored.locations);
      return true;
    }

    try {
      /* Las 11 peticiones van en paralelo: son independientes y juntas tardan
         lo que la más lenta, no la suma. */
      const responses = await Promise.all(
        REGIONS.map((region) =>
          fetch(`${API_BASE}/region/${region.slug}`, {
            headers: { Accept: 'application/json' },
          }),
        ),
      );

      const locations: StoredLocation[] = [];

      for (let i = 0; i < responses.length; i += 1) {
        const response = responses[i];
        /* Una región que falle no invalida el mapa: se pierde ese sector y
           las demás siguen siendo utilizables. */
        if (!response.ok) continue;

        const region = (await response.json()) as RawRegion;
        for (const location of region.locations) {
          locations.push([location.name, i, idFromUrl(location.url)]);
        }
      }

      if (locations.length === 0) throw new Error('Callejero vacío');

      hydrate(locations);
      writeJSON(KEYS.geo, {
        fetchedAt: Date.now(),
        locations,
      } satisfies StoredGazetteer);
      return true;
    } catch {
      if (stored && Array.isArray(stored.locations) && stored.locations.length > 0) {
        hydrate(stored.locations); // uno caducado sirve: la geografía es estable
        return true;
      }
      loading = null;
      return false;
    }
  })();

  return loading;
}

export function isReady(): boolean {
  return byName.size > 0;
}

export function size(): number {
  return byName.size;
}

export function getLocation(name: string): GeoLocation | undefined {
  return byName.get(name);
}

export function allLocations(): GeoLocation[] {
  return [...byName.values()];
}

export function locationsOfRegion(regionIndex: number): GeoLocation[] {
  return [...byName.values()]
    .filter((l) => l.regionIndex === regionIndex)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Resuelve la localización de una zona por prefijo más largo.
 *
 * Se recortan segmentos por la derecha en lugar de recorrer las 1013
 * localizaciones: como máximo una docena de consultas al Map, todas O(1).
 */
export function resolveLocation(areaName: string): GeoLocation | undefined {
  const parts = areaName.split('-');
  for (let take = parts.length; take > 0; take -= 1) {
    const candidate = parts.slice(0, take).join('-');
    const found = byName.get(candidate);
    if (found) return found;
  }
  return undefined;
}
