/* ==========================================================================
   Encuentros: las dos direcciones del mapa.

   · getEncounters(id)      espécimen → localizaciones donde aparece
   · getZoneDossier(locId)  localización → especies que la habitan

   Ambas cachean en memoria con LRU, igual que el resto de la capa de datos.
   Las peticiones de zonas de una misma localización van en paralelo y se
   acotan: una localización con muchas áreas anexas no debe disparar una
   ráfaga contra una API pública (NFR-08).
   ========================================================================== */

import { API_BASE, ApiError, isAbortError } from './pokeApi';
import { getLocation, resolveLocation } from './pokeGeo';
import { LRU } from '../utils/lru';
import { idFromUrl, toDisplayName } from '../utils/format';
import { REGIONS } from '../types/geo';
import type {
  EncounterDetail,
  EncounterZone,
  ZoneDossier,
  ZoneOccupant,
} from '../types/geo';

/** Máximo de zonas anexas que se consultan al abrir una localización. */
const MAX_AREAS_PER_LOCATION = 6;
const MAX_DETAILS = 6;

/* ── Etiquetas ───────────────────────────────────────────────────────────── */

const METHOD_LABELS: Record<string, string> = {
  walk: 'Hierba alta',
  surf: 'Surf',
  'old-rod': 'Caña vieja',
  'good-rod': 'Caña buena',
  'super-rod': 'Supercaña',
  'rock-smash': 'Golpe Roca',
  headbutt: 'Cabezazo',
  'dark-grass': 'Hierba oscura',
  'grass-spots': 'Sombras en la hierba',
  'cave-spots': 'Sombras en cueva',
  'bridge-spots': 'Sombras en el puente',
  'surf-spots': 'Sombras en el agua',
  'super-rod-spots': 'Sombras al pescar',
  'yellow-flowers': 'Flores amarillas',
  'purple-flowers': 'Flores moradas',
  'red-flowers': 'Flores rojas',
  'rough-terrain': 'Terreno agreste',
  'sweet-scent': 'Dulce Aroma',
  pokeflute: 'Poké Flauta',
  seaweed: 'Algas',
  gift: 'Regalo',
  'gift-egg': 'Huevo de regalo',
  'only-one': 'Encuentro único',
  'npc-trade': 'Intercambio con PNJ',
  'island-scan': 'Escáner insular',
  'squirt-bottle': 'Regadera',
  'devon-scope': 'Devon Scope',
};

const VERSION_LABELS: Record<string, string> = {
  red: 'Rojo',
  blue: 'Azul',
  yellow: 'Amarillo',
  gold: 'Oro',
  silver: 'Plata',
  crystal: 'Cristal',
  ruby: 'Rubí',
  sapphire: 'Zafiro',
  emerald: 'Esmeralda',
  firered: 'Rojo Fuego',
  leafgreen: 'Verde Hoja',
  diamond: 'Diamante',
  pearl: 'Perla',
  platinum: 'Platino',
  heartgold: 'HeartGold',
  soulsilver: 'SoulSilver',
  black: 'Negro',
  white: 'Blanco',
  'black-2': 'Negro 2',
  'white-2': 'Blanco 2',
  x: 'X',
  y: 'Y',
  'omega-ruby': 'Rubí Omega',
  'alpha-sapphire': 'Zafiro Alfa',
  sun: 'Sol',
  moon: 'Luna',
  'ultra-sun': 'Ultrasol',
  'ultra-moon': 'Ultraluna',
  'lets-go-pikachu': "Let's Go Pikachu",
  'lets-go-eevee': "Let's Go Eevee",
  sword: 'Espada',
  shield: 'Escudo',
  'legends-arceus': 'Leyendas Arceus',
  scarlet: 'Escarlata',
  violet: 'Púrpura',
};

const methodLabel = (name: string) => METHOD_LABELS[name] ?? toDisplayName(name);
const versionLabel = (name: string) => VERSION_LABELS[name] ?? toDisplayName(name);

/* ── Forma cruda de la API ───────────────────────────────────────────────── */

interface RawEncounterDetail {
  min_level: number;
  max_level: number;
  chance: number;
  method: { name: string };
}

interface RawVersionDetail {
  version: { name: string };
  max_chance: number;
  encounter_details: RawEncounterDetail[];
}

interface RawEncounter {
  location_area: { name: string; url: string };
  version_details: RawVersionDetail[];
}

interface RawLocation {
  name: string;
  areas: { name: string; url: string }[];
}

interface RawLocationArea {
  pokemon_encounters: {
    pokemon: { name: string; url: string };
    version_details: { max_chance: number }[];
  }[];
}

/* ── Espécimen → localizaciones ──────────────────────────────────────────── */

const encounterCache = new LRU<number, EncounterZone[]>(40);

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('Sin enlace con el archivo geográfico');
  }
  if (!response.ok) {
    throw new ApiError(`El archivo respondió ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Acumulador mientras se agrupan las zonas de una misma localización. */
interface ZoneAccumulator {
  areaCount: number;
  maxChance: number;
  versions: Set<string>;
  details: Map<string, EncounterDetail>;
}

export async function getEncounters(
  pokemonId: number,
  signal?: AbortSignal,
): Promise<EncounterZone[]> {
  const cached = encounterCache.get(pokemonId);
  if (cached) return cached;

  const raw = await fetchJson<RawEncounter[]>(
    `${API_BASE}/pokemon/${pokemonId}/encounters`,
    signal,
  );

  const grouped = new Map<string, ZoneAccumulator>();

  for (const entry of raw) {
    const location = resolveLocation(entry.location_area.name);
    /* Sin callejero cargado o con una zona que no resuelve no hay dónde
       pintar el nodo. Se descarta en silencio: el mapa muestra lo que puede
       situar, nunca inventa una posición. */
    if (!location) continue;

    let acc = grouped.get(location.name);
    if (!acc) {
      acc = { areaCount: 0, maxChance: 0, versions: new Set(), details: new Map() };
      grouped.set(location.name, acc);
    }

    acc.areaCount += 1;

    for (const version of entry.version_details) {
      acc.maxChance = Math.max(acc.maxChance, version.max_chance);
      acc.versions.add(versionLabel(version.version.name));

      for (const detail of version.encounter_details) {
        /* Se agrupa por método y rango de nivel: la API repite la misma
           combinación una vez por condición (hora del día, temporada…), y
           enumerarlas todas llenaría el panel de ruido. */
        const key = `${detail.method.name}|${detail.min_level}|${detail.max_level}`;
        const existing = acc.details.get(key);

        if (!existing || detail.chance > existing.chance) {
          acc.details.set(key, {
            method: detail.method.name,
            methodLabel: methodLabel(detail.method.name),
            minLevel: detail.min_level,
            maxLevel: detail.max_level,
            chance: detail.chance,
          });
        }
      }
    }
  }

  const zones: EncounterZone[] = [];

  for (const [locationName, acc] of grouped) {
    const location = getLocation(locationName);
    if (!location) continue;

    zones.push({
      locationName,
      locationId: location.locationId,
      label: location.label,
      regionIndex: location.regionIndex,
      regionLabel: REGIONS[location.regionIndex]?.label ?? '—',
      areaCount: acc.areaCount,
      maxChance: acc.maxChance,
      versions: [...acc.versions],
      details: [...acc.details.values()]
        .sort((a, b) => b.chance - a.chance)
        .slice(0, MAX_DETAILS),
    x: location.x,
      y: location.y,
    });
  }

  zones.sort((a, b) => a.regionIndex - b.regionIndex || b.maxChance - a.maxChance);

  encounterCache.set(pokemonId, zones);
  return zones;
}

/* ── Localización → especies ─────────────────────────────────────────────── */

const dossierCache = new LRU<number, ZoneDossier>(40);

export async function getZoneDossier(
  locationId: number,
  signal?: AbortSignal,
): Promise<ZoneDossier> {
  const cached = dossierCache.get(locationId);
  if (cached) return cached;

  const location = await fetchJson<RawLocation>(
    `${API_BASE}/location/${locationId}`,
    signal,
  );

  const geo = getLocation(location.name);
  const areas = location.areas.slice(0, MAX_AREAS_PER_LOCATION);

  const areaResults = await Promise.all(
    areas.map((area) =>
      fetchJson<RawLocationArea>(area.url, signal).catch((error: unknown) => {
        if (isAbortError(error)) throw error;
        return null; // una zona caída no debe vaciar el expediente entero
      }),
    ),
  );

  const byPokemon = new Map<string, ZoneOccupant>();

  for (const area of areaResults) {
    if (!area) continue;

    for (const encounter of area.pokemon_encounters) {
      const chance = encounter.version_details.reduce(
        (max, version) => Math.max(max, version.max_chance),
        0,
      );

      const existing = byPokemon.get(encounter.pokemon.name);
      if (existing) {
        existing.maxChance = Math.max(existing.maxChance, chance);
        continue;
      }

      byPokemon.set(encounter.pokemon.name, {
        name: encounter.pokemon.name,
        displayName: toDisplayName(encounter.pokemon.name),
        id: idFromUrl(encounter.pokemon.url),
        maxChance: chance,
      });
    }
  }

  const dossier: ZoneDossier = {
    label: geo?.label ?? toDisplayName(location.name),
    regionLabel:
      geo === undefined ? '—' : (REGIONS[geo.regionIndex]?.label ?? '—'),
    occupants: [...byPokemon.values()].sort(
      (a, b) => b.maxChance - a.maxChance || a.id - b.id,
    ),
    truncated: location.areas.length > MAX_AREAS_PER_LOCATION,
  };

  dossierCache.set(locationId, dossier);
  return dossier;
}
