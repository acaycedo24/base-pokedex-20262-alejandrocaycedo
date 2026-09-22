/* ==========================================================================
   Formato de presentación. Todo lo que convierte un dato crudo de PokeAPI en
   algo legible vive aquí, para que los componentes no hagan cálculos.
   ========================================================================== */

/** Nombres que no se resuelven bien con el algoritmo genérico. */
const SPECIAL_NAMES: Record<string, string> = {
  'mr-mime': 'Mr. Mime',
  'mr-rime': 'Mr. Rime',
  'mime-jr': 'Mime Jr.',
  'nidoran-f': 'Nidoran ♀',
  'nidoran-m': 'Nidoran ♂',
  farfetchd: "Farfetch'd",
  'sirfetchd': "Sirfetch'd",
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  'type-null': 'Type: Null',
  'tapu-koko': 'Tapu Koko',
  'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu',
  'tapu-fini': 'Tapu Fini',
  'flabebe': 'Flabébé',
};

/**
 * 'charizard-mega-x' → 'Charizard Mega X'
 *
 * Los nombres de PokeAPI son slugs en minúscula con guiones. El caso general
 * es capitalizar cada segmento; los sufijos de una sola letra ('x', 'f') se
 * ponen en mayúscula completa porque siempre son designadores de forma.
 */
export function toDisplayName(slug: string): string {
  const special = SPECIAL_NAMES[slug];
  if (special) return special;

  return slug
    .split('-')
    .map((part) =>
      part.length === 1
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');
}

/** Etiquetas de tipo en español. */
const TYPE_LABELS: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
  stellar: 'Estelar',
  unknown: 'Desconocido',
};

export function typeLabel(name: string): string {
  return TYPE_LABELS[name] ?? toDisplayName(name);
}

/**
 * Devuelve la referencia al token CSS del tipo. Si PokeAPI introduce un tipo
 * nuevo que aún no está en tokens.css, el `var()` de respaldo evita que el
 * color caiga a transparente.
 */
export function typeColorVar(name: string): string {
  return `var(--type-${name}, var(--type-unknown))`;
}

/** 25 → '#0025'. El archivo siempre muestra cuatro dígitos. */
export function formatDexId(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

/** PokeAPI entrega decímetros: 4 → '0.4 m'. */
export function formatHeight(decimeters: number): string {
  return `${(decimeters / 10).toFixed(1)} m`;
}

/** PokeAPI entrega hectogramos: 60 → '6.0 kg'. */
export function formatWeight(hectograms: number): string {
  return `${(hectograms / 10).toFixed(1)} kg`;
}

/**
 * Extrae el id numérico de una URL de recurso de PokeAPI.
 * 'https://pokeapi.co/api/v2/pokemon/25/' → 25
 *
 * El índice completo no trae los ids como campo, solo la URL, así que esta
 * función es la que hace utilizable el índice (ADR-02).
 */
export function idFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  return match ? Number(match[1]) : 0;
}

/** true si el término es un número de Pokédex y no un nombre. */
export function isNumeric(term: string): boolean {
  return /^\d+$/.test(term);
}

/**
 * Normaliza lo que escribe el usuario a la forma que espera la API:
 * minúsculas, sin espacios sobrantes y con los espacios internos convertidos
 * en guiones, de modo que "mr mime" encuentre a 'mr-mime'.
 */
export function normalizeTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos: "pikachú" → "pikachu"
    .replace(/\s+/g, '-');
}
