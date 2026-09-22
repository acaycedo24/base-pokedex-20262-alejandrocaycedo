/* ==========================================================================
   Modelo geográfico.

   Advertencia que condiciona todo este módulo: **la PokeAPI no expone
   coordenadas**. No hay latitud, longitud ni posición de ningún tipo en
   ningún endpoint. El mapa no se lee: se construye.

   Lo que sí hay es una jerarquía real que se puede reconstruir:
     región  →  localización  →  zona (location-area)  →  encuentros

   El radar coloca cada localización dentro del sector de su región mediante
   un hash determinista de su nombre, de modo que una misma localización cae
   siempre en el mismo punto entre sesiones y entre usuarios.
   ========================================================================== */

/** Las 11 regiones de la PokeAPI, en orden de generación. */
export const REGIONS = [
  { slug: 'kanto', label: 'Kanto' },
  { slug: 'johto', label: 'Johto' },
  { slug: 'hoenn', label: 'Hoenn' },
  { slug: 'sinnoh', label: 'Sinnoh' },
  { slug: 'unova', label: 'Teselia' },
  { slug: 'kalos', label: 'Kalos' },
  { slug: 'alola', label: 'Alola' },
  { slug: 'galar', label: 'Galar' },
  { slug: 'hisui', label: 'Hisui' },
  { slug: 'paldea', label: 'Paldea' },
  { slug: 'orre', label: 'Orre' },
] as const;

export type RegionSlug = (typeof REGIONS)[number]['slug'];

/** Una localización del callejero, con su región y su posición en el radar. */
export interface GeoLocation {
  name: string;
  /** Índice dentro de REGIONS. Determina el sector del radar. */
  regionIndex: number;
  /** Id de PokeAPI, necesario para consultar sus zonas al pulsarla. */
  locationId: number;
  label: string;
  x: number;
  y: number;
}

/* ── Encuentros ──────────────────────────────────────────────────────────── */

export interface EncounterDetail {
  method: string;
  methodLabel: string;
  minLevel: number;
  maxLevel: number;
  chance: number;
}

/**
 * Una localización donde aparece el espécimen consultado.
 *
 * Se agrupa por localización y no por zona: una misma localización puede
 * tener varias zonas ('safari-zone-north', '-south'…), y pintarlas como
 * nodos distintos las apilaría en el mismo punto del radar, porque la
 * posición se deriva del nombre de la localización.
 */
export interface EncounterZone {
  locationName: string;
  locationId: number;
  label: string;
  regionIndex: number;
  regionLabel: string;
  /** Cuántas zonas de esa localización registran al espécimen. */
  areaCount: number;
  /** Mejor probabilidad entre todas las versiones, 0–100. Fija el brillo. */
  maxChance: number;
  /** Versiones de juego en las que aparece, ya legibles. */
  versions: string[];
  details: EncounterDetail[];
  x: number;
  y: number;
}

/** Una especie que habita la zona consultada (dirección inversa). */
export interface ZoneOccupant {
  name: string;
  displayName: string;
  id: number;
  maxChance: number;
}

/** Resultado de abrir una zona del mapa. */
export interface ZoneDossier {
  label: string;
  regionLabel: string;
  occupants: ZoneOccupant[];
  /** true si la lista se recortó por tener demasiadas zonas anexas. */
  truncated: boolean;
}
