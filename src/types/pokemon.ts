/* ==========================================================================
   Modelo de dominio.

   Dos familias de tipos conviven aquí a propósito:

   - `Raw*`  describe la forma que devuelve PokeAPI. Solo services/pokeApi.ts
             debe tocarlos.
   - El resto describe el modelo propio de la aplicación. Es lo único que ven
             los hooks y los componentes.

   La frontera entre ambas está en `normalizePokemon()`. Si PokeAPI cambia,
   solo esa función cambia. Ver ARCHITECTURE.md §6.
   ========================================================================== */

/* ── Forma de la API externa ─────────────────────────────────────────────── */

export interface RawNamedResource {
  name: string;
  url: string;
}

export interface RawPokemonListResponse {
  count: number;
  results: RawNamedResource[];
}

export interface RawPokemon {
  id: number;
  name: string;
  height: number; // decímetros
  weight: number; // hectogramos
  types: { slot: number; type: RawNamedResource }[];
  abilities: { is_hidden: boolean; slot: number; ability: RawNamedResource }[];
  stats: { base_stat: number; stat: RawNamedResource }[];
  sprites: {
    front_default: string | null;
    other?: {
      'official-artwork'?: { front_default: string | null };
      home?: { front_default: string | null };
    };
  };
  /* Añadido por PokeAPI en 2024: el endpoint principal ya trae el audio,
     así que reproducir un grito no cuesta una petición extra. */
  cries?: { latest?: string | null; legacy?: string | null };
}

/* ── Modelo propio ───────────────────────────────────────────────────────── */

/* Sin `enum`: tsconfig usa `erasableSyntaxOnly`, que lo prohíbe. */
export const STAT_KEYS = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/* Etiquetas cortas, en el registro de instrumento que usa la interfaz. */
export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'PS',
  attack: 'ATQ',
  defense: 'DEF',
  'special-attack': 'AT.ESP',
  'special-defense': 'DF.ESP',
  speed: 'VEL',
};

/* Techo usado para normalizar las barras. El máximo real del juego es 255
   (Blissey en PS), pero escalar contra 255 dejaría a casi todos los
   especímenes por debajo de un tercio de la barra y el panel se vería muerto.
   180 reparte mejor el rango habitual; los valores que lo superan se recortan
   visualmente pero muestran su cifra exacta. */
export const STAT_CEILING = 180;

export interface PokemonType {
  /** Identificador de PokeAPI: 'fire', 'water', … */
  name: string;
  /** Etiqueta en español para mostrar. */
  label: string;
  /** Token CSS con el color del tipo: 'var(--type-fire)'. */
  color: string;
}

export interface PokemonStat {
  key: StatKey;
  label: string;
  value: number;
}

export interface PokemonAbility {
  name: string;
  hidden: boolean;
}

export interface PokemonCries {
  latest?: string;
  legacy?: string;
}

export interface Pokemon {
  id: number;
  /** Nombre canónico de la API: 'mr-mime'. Es la clave de caché. */
  name: string;
  /** Nombre para mostrar: 'Mr. Mime'. */
  displayName: string;
  types: PokemonType[];
  /** Artwork oficial en alta resolución. */
  sprite: string;
  /** Sprite pequeño, respaldo si el artwork no existe. */
  spriteFallback: string;
  /** Metros, ya convertido desde decímetros. */
  heightM: number;
  /** Kilogramos, ya convertido desde hectogramos. */
  weightKg: number;
  abilities: PokemonAbility[];
  /** Siempre 6 entradas, siempre en el orden de STAT_KEYS. */
  stats: PokemonStat[];
  cries: PokemonCries;
}

/* ── Búsqueda ────────────────────────────────────────────────────────────── */

/** Una entrada del índice local. Se mantiene mínima: se guardan 1351 en LocalStorage. */
export interface IndexEntry {
  name: string;
  id: number;
}

export interface Suggestion {
  name: string;
  id: number;
  /** Nombre ya formateado para mostrar. */
  label: string;
  /** Rango coincidente dentro de `label`, para resaltarlo. -1 si no aplica. */
  matchStart: number;
  matchEnd: number;
}

export type SearchStatus =
  | 'idle'
  | 'typing'
  | 'loading'
  | 'success'
  | 'notfound'
  | 'error';

/** 'local' = índice cargado, autocompletado sin red. 'remote' = degradado. */
export type SearchMode = 'local' | 'remote';

/* ── Historial ───────────────────────────────────────────────────────────── */

export interface RecentEntry {
  id: number;
  name: string;
  displayName: string;
  sprite: string;
  /** Epoch ms. Ordena el panel de recientes (MRU). */
  at: number;
}
