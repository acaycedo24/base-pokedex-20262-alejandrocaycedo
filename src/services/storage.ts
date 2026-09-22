/* ==========================================================================
   Acceso a LocalStorage a prueba de fallos.

   LocalStorage falla más de lo que parece: modo privado en Safari, cuota
   llena, políticas de cookies de terceros, o `localStorage` directamente
   ausente. Cualquiera de esos casos lanza al *acceder*, no al escribir.

   Regla del proyecto (PRD FR-03, ARCHITECTURE §8): la persistencia es una
   mejora, nunca un requisito. Estas funciones jamás lanzan; devuelven `null`
   o `false` y la aplicación sigue con el estado en memoria.
   ========================================================================== */

const PREFIX = 'pokesearch.';

/** Una sola comprobación por sesión: si no hay almacenamiento, no insistimos. */
let available: boolean | null = null;

function isAvailable(): boolean {
  if (available !== null) return available;
  try {
    const probe = `${PREFIX}__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readJSON<T>(key: string): T | null {
  if (!isAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // JSON corrupto o acceso denegado: se trata como "no hay nada guardado".
    return null;
  }
}

/** @returns true si se pudo persistir. El llamador puede ignorarlo sin riesgo. */
export function writeJSON(key: string, value: unknown): boolean {
  if (!isAvailable()) return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    // Caso típico: QuotaExceededError con el índice de 93 KB.
    return false;
  }
}

export function remove(key: string): void {
  if (!isAvailable()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* sin efecto */
  }
}

/* Claves usadas en la aplicación, centralizadas para evitar divergencias.
   El sufijo de versión permite invalidar formatos antiguos con solo subirlo. */
export const KEYS = {
  index: 'index.v1',
  recent: 'recent.v1',
  audio: 'audio.v1',
  booted: 'booted.v1',
  geo: 'geo.v1',
} as const;
