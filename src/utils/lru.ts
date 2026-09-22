/**
 * Caché LRU mínima sobre `Map`.
 *
 * Se apoya en una garantía del lenguaje: `Map` itera en orden de inserción.
 * Por tanto la primera clave que devuelve `keys()` es siempre la más antigua,
 * y basta con re-insertar una clave al leerla para moverla al final. No hace
 * falta lista doblemente enlazada.
 *
 * Se usa para los detalles de Pokémon (ADR-04) y para los AudioBuffer de los
 * gritos ya decodificados (ADR-05).
 */
export class LRU<K, V> {
  readonly #max: number;
  readonly #map = new Map<K, V>();

  constructor(max: number) {
    if (max < 1) throw new RangeError('LRU: el tamaño máximo debe ser >= 1');
    this.#max = max;
  }

  get(key: K): V | undefined {
    if (!this.#map.has(key)) return undefined;
    // Re-insertar la promueve a "usada más recientemente".
    const value = this.#map.get(key) as V;
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  set(key: K, value: V): void {
    // Borrar antes de insertar mantiene correcto el orden en una sobrescritura.
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);

    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value as K;
      this.#map.delete(oldest);
    }
  }

  get size(): number {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }
}
