# ARCHITECTURE — PokeSearch "Holo-UI"

| Campo | Valor |
|---|---|
| Documento | Decisiones técnicas y diseño de sistema |
| Versión | 1.0 |
| Fase BMAD | Fase 1 — Agentic Planning |
| Rol autor | Arquitecto |
| Estado | **Pendiente de aprobación** |
| PRD de referencia | [PRD.md](PRD.md) |

---

## 0. Estado actual del repositorio

Lo que ya existe y qué se hace con ello:

Lo que existía antes de empezar y qué se hizo con ello (decidido y ejecutado al aprobarse
esta arquitectura):

| Origen | Qué era | Decisión aplicada |
|---|---|---|
| `my-app/` | Andamiaje Vite 8 + React 19.2 + TypeScript 6 + oxlint, ya instalado | **Promovido a la raíz** del proyecto; el nivel intermedio se eliminó |
| `index.html`, `script.js` | Buscador previo en JavaScript plano | Archivado en [legacy/](legacy/) como referencia; no se borró |
| [_bmad/](_bmad/), [_bmad-output/](_bmad-output/) | Instalación del framework BMAD | Intacto |

Reutilizar el andamiaje en vez de crear uno nuevo evita reinstalar ~200 MB de
`node_modules` y mantiene una sola versión de herramientas ya verificada. La aplicación
vive en la raíz: `npm run dev` se ejecuta desde `pokesearch/`.

---

## 1. Stack

| Capa | Elección | Versión |
|---|---|---|
| Framework | React | 19.2 |
| Build | Vite | 8.3 |
| Lenguaje | TypeScript | 6.0 |
| Estilos | **CSS Modules** + custom properties | nativo de Vite |
| Lint | oxlint | 1.81 |
| Enrutado | react-router-dom | 7.18 |
| Estado | Hooks + Context | — |
| Datos | `fetch` nativo | — |
| Audio | Web Audio API | — |

**Una única dependencia de producción: `react-router-dom`** (ver ADR-09). Todo lo
demás —caché, audio, mapa, animaciones— se construye sobre React, la plataforma web
y la PokeAPI.

---

## 2. Decisiones de arquitectura (ADR)

### ADR-01 — CSS Modules en lugar de Tailwind

**Decisión:** CSS Modules con un archivo de tokens global en custom properties.

**Razón.** El valor visual de PokeSearch está concentrado en cosas que Tailwind expresa
mal: `@keyframes` compuestos, `backdrop-filter` en capas, gradientes cónicos para el
barrido de radar, `radial-gradient` que sigue al cursor, `perspective` con transformaciones
3D encadenadas y `clip-path`. Escribir eso en utilidades obliga a `arbitrary values`
anidados e ilegibles o a salir igualmente a un archivo CSS — se pagaría el coste de
Tailwind sin cobrar su beneficio.

A cambio, CSS Modules da alcance local automático, cero configuración en Vite, cero
dependencias, cero paso de purga en el build, y deja las animaciones donde se pueden leer
y ajustar. La consistencia que aportaría Tailwind se obtiene aquí con los tokens de
`styles/tokens.css`, que son la única fuente de colores, espaciados y curvas de animación.

**Descartado:** Tailwind (mal encaje con el diseño), styled-components (runtime JS
innecesario), CSS-in-JS con build (complejidad sin retorno aquí).

---

### ADR-02 — Índice completo en local: el autocompletado no toca la red

**Decisión.** Al arrancar, la app descarga **una sola vez** el índice completo de nombres
y lo guarda en memoria y en LocalStorage. El autocompletado filtra ese índice en memoria.

**Medición que respalda la decisión** (verificada contra la API en vivo):

| Métrica | Valor |
|---|---|
| `GET /pokemon?limit=100000` | **93 KB**, **1351 entradas**, ~0.28 s |
| `cache-control` de PokeAPI | `public, max-age=86400` |

**Razón.** El requerimiento del cliente es "evitar bloqueos de red al escribir rápido".
La forma más robusta de cumplirlo no es amortiguar las peticiones: es **eliminarlas del
camino crítico**. Escribir "charizard" con el enfoque clásico de una petición por término
genera hasta 9 peticiones, condiciones de carrera y dependencia de la latencia. Con el
índice local genera **cero**, y la sugerencia aparece en el mismo cuadro de animación.
93 KB por sesión es menos de lo que costarían esas 9 peticiones sueltas.

Además, PokeAPI **no ofrece un endpoint de búsqueda por prefijo**: filtrar en cliente no
es una optimización opcional, es la única forma correcta de hacer autocompletado contra
esta API.

**Persistencia.** El índice se guarda en LocalStorage bajo `pokesearch.index.v1` con
`{ version, fetchedAt, entries }` y un TTL de 7 días. En visitas siguientes el
autocompletado funciona **antes** de que termine cualquier petición, e incluso sin red.

**Degradación.** Si la descarga del índice falla y no hay copia en caché, `usePokeSearch`
cambia a modo `remote`: debounce de 300 ms y consulta directa `GET /pokemon/{término}`
para validar existencia. El producto pierde el autocompletado rico, no la búsqueda.

---

### ADR-03 — Debounce sí, pero por una razón distinta a la habitual

Como el filtrado es local, el debounce ya no protege a la red: protege al **render**.
Recorrer y ordenar 1351 entradas y reconciliar la lista en cada pulsación de un usuario
rápido produce trabajo desperdiciado.

**Decisión:** `useDebouncedValue(term, 120)` para alimentar el cómputo de sugerencias,
más `useMemo` sobre el término amortiguado. El **valor del input sigue siendo
completamente controlado y sin retardo** — el usuario nunca percibe latencia al escribir;
solo la lista de sugerencias se estabiliza 120 ms después.

En modo `remote` (degradado) el mismo hook sube a 300 ms, que es el papel clásico del
debounce.

---

### ADR-04 — Caché de detalle en tres niveles, con deduplicación y cancelación

Las fichas de detalle (`GET /pokemon/{id}`) sí van a la red. Su capa de acceso implementa:

1. **Caché en memoria (LRU, 100 entradas).** Volver a un Pokémon ya consultado es
   instantáneo y no genera petición.
2. **Deduplicación de peticiones en vuelo.** Un `Map<string, Promise>` garantiza que dos
   solicitudes simultáneas del mismo recurso comparten una única petición HTTP.
3. **Cancelación por `AbortController`.** Cada búsqueda nueva aborta la anterior. Junto
   con un contador de secuencia (`requestId`) que descarta respuestas obsoletas al
   aplicar el resultado, esto cierra la condición de carrera de NFR-03 por los dos
   extremos: se cancela lo que se puede y se ignora lo que llegue tarde igualmente.

El navegador aporta un cuarto nivel gratis gracias al `max-age=86400` de PokeAPI.

**No se usa React Query ni SWR:** aportarían caché, deduplicación y cancelación, pero
añaden ~13 KB gzip y una dependencia para un modelo de datos que aquí cabe en un módulo
de unas 80 líneas. El objetivo del ejercicio incluye demostrar la mecánica, no ocultarla.

---

### ADR-05 — Audio: síntesis para el teclado, buffers decodificados para los gritos

Son dos problemas distintos y se resuelven distinto dentro de un mismo `AudioContext`.

**Blip de teclado — sintetizado, nunca descargado.**
Un archivo de audio, por pequeño que sea, implica red, decodificación y un primer disparo
tardío. En su lugar, cada pulsación construye un grafo efímero:

```
OscillatorNode (square, 620–900 Hz con jitter aleatorio)
  → GainNode (envolvente: ataque 1 ms → caída exponencial 18 ms, pico 0.06)
    → masterGain → destination
```

Un segundo componente de ruido breve pasado por un `BiquadFilterNode` en `highpass`
(~2 kHz) aporta el "clic" mecánico. Coste: microsegundos, cero bytes, cero espera.
`Backspace` usa el mismo grafo con la frecuencia una quinta más grave y menor duración.

**Limitación de disparos.** Máximo un blip cada 35 ms. Un usuario a 15 pulsaciones por
segundo escucha una cadencia limpia en lugar de una saturación que además sumaría nodos.

**Gritos — buffers decodificados y cacheados.**
`fetch(cries.latest)` → `arrayBuffer()` → `decodeAudioData()` → `AudioBufferSourceNode`.
El `AudioBuffer` resultante se guarda en un LRU de 30 entradas, así que repetir un grito
es instantáneo. Se conserva la referencia al `source` activo para poder `stop()`-earlo
cuando llega otro grito (FR-06: nunca se solapan).

Verificado: los gritos son `.ogg` de ~7 KB servidos con `Access-Control-Allow-Origin: *`
desde `raw.githubusercontent.com`, por lo que `fetch` + `decodeAudioData` son viables sin
proxy. `cries.legacy` se usa como respaldo si `latest` falla.

**Riesgo conocido — Ogg en Safari.** `decodeAudioData` puede rechazar Ogg Vorbis en
versiones antiguas de Safari. Estrategia: si la decodificación falla, se reintenta una vez
con `cries.legacy`; si también falla, se marca ese espécimen como sin audio y **se
continúa en silencio**. Un navegador que no puede sonar no puede romper la búsqueda.

**Política de autoplay.** El `AudioContext` se crea de forma perezosa en el **primer
gesto real del usuario** (`pointerdown` o `keydown`), y se llama a `resume()` si queda en
estado `suspended`. Crearlo al montar produciría un contexto suspendido y el primer blip
se perdería.

---

### ADR-06 — Inclinación 3D sin estado de React

Mover el ratón dispara eventos a ~60–120 Hz. Llevar eso a `useState` re-renderizaría el
árbol de la ficha en cada movimiento.

**Decisión:** `useTilt` escribe directamente sobre el nodo DOM mediante `ref`, usando
custom properties, y agrupa las escrituras en `requestAnimationFrame`:

```css
transform: perspective(900px)
           rotateX(var(--tilt-x)) rotateY(var(--tilt-y))
           translateZ(0);
```

React no participa en la animación: **cero re-renders**, trabajo sobre el hilo de
composición y una sola escritura por cuadro. El reflejo usa las mismas variables
(`--glare-x`, `--glare-y`) en un `radial-gradient` de una capa superpuesta.

El hook devuelve un `ref` inerte cuando `prefers-reduced-motion: reduce` está activo o
cuando el dispositivo es táctil (`matchMedia('(hover: none)')`).

---

### ADR-07 — Estado local y un solo Context

No hay Redux, Zustand ni Jotai. El estado real del producto es pequeño y de vida corta:
término, sugerencias, espécimen seleccionado, estado de carga, historial.

> **Actualizado por ADR-09.** El espécimen seleccionado ya no es estado de React:
> lo dice la URL. Lo de abajo sigue valiendo para el resto.

- **Estado del buscador:** vive dentro de `useSearchBox`, consumido por un único árbol.
- **Preferencias de audio** (silencio, volumen): `AudioProvider` con Context, porque lo
  necesitan componentes distantes (el input y el botón de silencio de la cabecera) y
  cambia con muy poca frecuencia — el caso donde Context no causa problemas de rendimiento.
- **Caché de datos:** vive en el módulo `services/pokeApi.ts`, fuera de React. No es
  estado de UI y no debe provocar renders.

Introducir una librería de estado global aquí añadiría ceremonia sin resolver ningún
problema existente.

---

### ADR-08 — El mapa se construye: PokeAPI no tiene coordenadas

**El hecho de partida.** No hay latitud, longitud ni posición en ningún endpoint
de PokeAPI. Lo que sí existe es una jerarquía completa y consultable:
`región → localización → zona (location-area) → encuentros`.

**Decisión: radar de sectores con posición derivada del nombre.** Las 11 regiones
ocupan un sector de 32.7° cada una. Dentro de su sector, cada localización se
sitúa con un hash FNV-1a de su nombre: el ángulo sale de una semilla y el radio de
otra, corregido con una raíz cuadrada para que los nodos no se apelotonen cerca
del centro. La consecuencia que importa es que **la posición es estable**: una
localización cae siempre en el mismo punto, en todas las sesiones y para todos los
usuarios, sin almacenar ni una sola coordenada.

Se descartó un mapa geográfico real (Kanto sobre Japón, Kalos sobre Francia…):
sitúa correctamente las 11 regiones pero no las 1013 localizaciones, que es el
dato que el usuario quiere ver, y obliga a una librería de mapas y a servidores de
teselas externos.

**El problema de las 80 peticiones.** El endpoint de encuentros devuelve zonas
(`kanto-route-2-south-towards-viridian-city`) pero no dice a qué localización ni a
qué región pertenecen. Averiguarlo por la API cuesta dos peticiones por zona: 80
para un Pokémon con 40 zonas, y Magikarp tiene 287.

**Solución: resolución por prefijo contra un callejero local.** Se descarga una vez
el callejero (11 peticiones, una por región → 1013 localizaciones, 89 KB) y se
persiste en LocalStorage con TTL de 30 días. Las zonas se resuelven recortando
segmentos por la derecha hasta encontrar una localización conocida, aprovechando
que PokeAPI nombra la zona empezando por su localización.

**Verificado contra la API antes de escribir el código**, porque es una heurística
y no un contrato:

| Comprobación | Resultado |
|---|---|
| Cobertura sobre las 1539 zonas existentes | **100 %** resueltas |
| Exactitud contra `/location-area/{id}` (muestra aleatoria de 20) | **20/20** correctas |
| Zonas sin resolver en Pikachu, Charizard, Caterpie, Mewtwo y Magikarp | **0** de 402 |

Coste: como máximo una docena de búsquedas O(1) en un `Map` por zona, frente a dos
peticiones de red. Si alguna zona no resolviera, se descarta en silencio: el mapa
muestra lo que puede situar y nunca inventa una posición.

**Agrupación por localización, no por zona.** Una localización puede tener varias
zonas anexas, y como la posición se deriva del nombre de la localización, pintarlas
por separado las apilaría en el mismo punto. Se agrupan sumando áreas, quedándose
con la mejor probabilidad y fusionando métodos de encuentro equivalentes.

**Carga diferida.** El callejero cuesta 11 peticiones, así que no se descarga al
arrancar sino al abrir el mapa por primera vez. Quien solo use el buscador no paga
por la geografía.

**Un solo `<path>` para el fondo.** Las 1013 localizaciones se dibujan como puntos
apagados mediante un único elemento: un segmento de longitud casi nula (`h.01`) por
punto con `stroke-linecap: round`. Un `<circle>` por localización serían 1013 nodos
del DOM solo para el decorado.

---

### ADR-09 — Enrutado con react-router-dom: la URL como fuente de verdad

**Revierte la promesa de "cero dependencias de producción" del ADR-01.** Se hace a
petición explícita, y el cambio se gana su sitio: resuelve un bug real y elimina
una clase entera de problemas.

**Antes.** El espécimen seleccionado vivía en el estado de `usePokeSearch`, y la
zona abierta del mapa en el de `usePokeMap`. Consecuencias: recargar perdía la
consulta, no había enlace que compartir, el botón Atrás no hacía nada, y —el
fallo que se reportó— el expediente de una zona se guardaba junto al `pokemonId`
que lo había pedido, así que **elegir una especie dentro del expediente lo
borraba en el mismo clic**.

**Ahora.** La URL describe el estado navegable:

| Ruta | Componente | Qué describe |
|---|---|---|
| `/` | `HomePage` | Terminal en reposo |
| `/pokemon/:name` | `SpecimenPage` | Ficha del espécimen |
| `/pokemon/:name/mapa` | `MapPage` | Sus avistamientos |
| `/mapa` | `MapPage` | Exploración libre |
| `?zona=<id>` | — | Expediente de una localización |
| `*` | `NotFoundPage` | Ruta inexistente |

`Layout` es una ruta padre que **nunca se desmonta**, y ahí vive el buscador: al
pasar de la ficha al mapa no se pierde el texto escrito, ni el índice en memoria,
ni la caché LRU, ni los `AudioBuffer` decodificados, ni el `AudioContext` ya
desbloqueado por el primer gesto del usuario. Ese último es el que más se nota:
recargar lo devuelve a `suspended` y el primer blip se pierde otra vez.

El expediente, además, ya no depende del espécimen: describe un **lugar**, y
cambiar de Pokémon no lo invalida.

**Coste medido:** +14 KB gzip (85 → 99.6 KB). Sigue por debajo del presupuesto de
150 KB del PRD.

**Contrapartida de despliegue.** Un host estático no conoce `/pokemon/pikachu` y
devolvería 404. Se añade [`public/_redirects`](public/_redirects) para Netlify y
compatibles; Vite ya aplica el fallback en `dev` y en `preview`. Verificado: las
rutas profundas sirven `index.html` en ambos modos.

---

### ADR-10 — `memo` donde compensa, y solo donde compensa

Por defecto un componente se re-renderiza cuando lo hace su padre. El caso que
duele aquí es el buscador: **cada tecla** renderiza el layout entero.

Se envuelven en `memo` los componentes caros cuyas props cambian poco:
`SuggestionList`, `RecentSearches`, `SearchTerminal`, `HoloMap`, `SpecimenCard`,
`StatBars` y `HoloBackground`.

Dos precisiones que evitan que sea humo:

- **`memo` sin `useCallback` no sirve.** Compara props por identidad, y una
  función creada en el render es nueva cada vez. Por eso `handleSelect` en
  `Layout` va memoizado.
- **`memo` no detiene a Context.** `AudioToggle` se deja sin memoizar a
  propósito: consume el contexto de audio y un cambio de contexto lo atraviesa
  igualmente. Memoizarlo solo daría falsa sensación de optimización.

Se añade también un `ErrorBoundary` — el único componente de clase del proyecto,
porque los hooks no pueden capturar errores de render. Sin él, una excepción
desmonta el árbol y deja la pantalla en blanco, que para quien lo sufre es
indistinguible de "se ha recargado la página".

La correspondencia entre estos conceptos y el código está desarrollada en
[CONCEPTOS.md](CONCEPTOS.md).

---

## 3. Estructura de carpetas

```
pokesearch/
├── PRD.md
├── ARCHITECTURE.md
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── legacy/                       # buscador previo en JS plano (referencia)
├── _bmad/  _bmad-output/         # framework BMAD
└── src/
    ├── main.tsx
    ├── App.tsx                        # composición + secuencia de arranque
    │
    ├── components/
    │   ├── BootSequence/              # terminal retro de inicialización
    │   ├── HoloBackground/            # rejilla en perspectiva + partículas
    │   ├── SearchTerminal/            # input combobox + anillo de foco
    │   ├── SuggestionList/            # autocompletado con resaltado
    │   ├── RecentSearches/            # panel MRU de LocalStorage
    │   ├── SpecimenCard/              # ficha con inclinación 3D
    │   ├── StatBars/                  # estadísticas animadas
    │   ├── RadarLoader/               # barrido durante la carga
    │   ├── ErrorPanel/                # errores en lenguaje de terminal
    │   ├── AudioToggle/               # interruptor de silencio
    │   └── HoloMap/                   # radar de sectores + expediente de zona
    │       ├── HoloMap.tsx
    │       └── ZoneDossier.tsx
    │
    ├── hooks/
    │   ├── useAudio.ts                # síntesis y control de sonido
    │   ├── usePokeSearch.ts           # lógica del buscador
    │   ├── usePokeMap.ts              # avistamientos y expedientes de zona
    │   ├── useDebouncedValue.ts
    │   ├── useRecentSearches.ts
    │   ├── useTilt.ts
    │   └── useReducedMotion.ts
    │
    ├── services/
    │   ├── pokeApi.ts                 # fetch + caché + dedupe + abort
    │   ├── pokeIndex.ts               # índice, persistencia y ranking
    │   ├── pokeGeo.ts                 # callejero, sectores y posiciones
    │   ├── pokeEncounters.ts          # encuentros en ambas direcciones
    │   └── storage.ts                 # LocalStorage a prueba de fallos
    │
    ├── context/
    │   └── AudioProvider.tsx
    │
    ├── types/
    │   ├── pokemon.ts                 # modelos de dominio
    │   └── geo.ts                     # regiones, zonas y encuentros
    │
    ├── utils/
    │   ├── lru.ts
    │   └── format.ts                  # altura/peso/nombres legibles
    │
    └── styles/
        ├── tokens.css                 # ÚNICA fuente de color/espaciado/curvas
        ├── animations.css             # @keyframes compartidos
        └── global.css
```

Cada carpeta de `components/` contiene `Componente.tsx` + `Componente.module.css`.

---

## 4. Contratos de los hooks

Estas firmas son vinculantes para la Fase 2.

### `usePokeSearch`

```ts
type SearchStatus = 'idle' | 'typing' | 'loading' | 'success' | 'notfound' | 'error';

interface Suggestion { name: string; id: number; label: string; matchStart: number; matchEnd: number; }

interface UsePokeSearch {
  term: string;
  setTerm: (value: string) => void;

  suggestions: Suggestion[];
  highlightedIndex: number;            // -1 = ninguna
  moveHighlight: (delta: 1 | -1) => void;
  setHighlightedIndex: (index: number) => void;   // el puntero marca al pasar

  status: SearchStatus;
  pokemon: Pokemon | null;
  error: string | null;

  select: (nameOrId: string | number) => Promise<void>;
  submit: () => Promise<void>;          // Enter sin sugerencia marcada
  retry: () => Promise<void>;           // repite la última consulta fallida
  reset: () => void;

  indexReady: boolean;
  indexSize: number;
  mode: 'local' | 'remote';             // 'remote' = degradado (ADR-02)

  // El historial se expone desde aquí porque `select` es quien lo alimenta:
  // separarlo obligaría al componente a coordinar dos hooks que ya están
  // acoplados por el mismo evento.
  recent: RecentEntry[];
  removeRecent: (id: number) => void;
  clearRecent: () => void;
}
```

**Invariantes**
- `setTerm` actualiza `term` de forma síncrona; solo el cálculo de `suggestions` pasa por
  el debounce de 120 ms.
- `select` aborta cualquier petición en vuelo antes de lanzar la suya.
- Una respuesta cuyo `requestId` no sea el vigente se descarta en silencio.
- `select` con éxito registra la entrada en el historial reciente y dispara el grito.

### `useAudio`

```ts
interface UseAudio {
  playKeyBlip: (variant?: 'type' | 'delete') => void;   // síncrono, fire-and-forget
  playCry: (cries: { latest?: string; legacy?: string }) => Promise<void>;
  stopCry: () => void;
  muted: boolean;
  toggleMute: () => void;
  volume: number;                                        // 0–1, aplicado a masterGain
  setVolume: (v: number) => void;
  unlock: () => void;                                    // crea/reanuda el AudioContext
}
```

**Invariantes**
- `playKeyBlip` **nunca** devuelve una promesa ni lanza excepción: si el audio no está
  disponible, no hace nada. No debe poder romper el manejador `onChange` del input.
- Hay un único `AudioContext` en toda la aplicación, con un único `masterGain`.
- `playCry` detiene el grito anterior antes de iniciar el nuevo.
- Con `muted === true` no se crea ningún nodo ni se descarga ningún grito.

### Hooks de apoyo

```ts
function useDebouncedValue<T>(value: T, delay: number): T;
function useRecentSearches(max?: number): {
  recent: RecentEntry[];
  add: (entry: RecentEntry) => void;
  remove: (id: number) => void;
  clear: () => void;
};
function useTilt(maxDeg?: number): React.RefObject<HTMLElement>;
function useReducedMotion(): boolean;
```

---

## 5. Flujo de datos

```
Arranque
  └─ pokeIndex.load()
       ├─ LocalStorage 'pokesearch.index.v1' vigente → listo en <5 ms
       └─ si no → GET /pokemon?limit=100000 (93 KB) → normaliza → memoria + LocalStorage

Tecleo
  input.onChange
    ├─ setTerm(value)              → estado síncrono, sin retardo
    └─ audio.playKeyBlip()         → fire-and-forget, fuera del camino del render
         ↓ (debounce 120 ms)
    pokeIndex.search(term)         → memoria, sin red
         ↓
    suggestions → SuggestionList

Selección (Enter / clic / ↑↓ + Enter)
  select(name)
    ├─ abortController.abort()     → cancela la petición anterior
    ├─ pokeApi.getPokemon(name)
    │     ├─ LRU en memoria        → retorno inmediato
    │     ├─ Map de peticiones en vuelo → comparte promesa
    │     └─ fetch + AbortSignal   → caché HTTP del navegador (max-age 86400)
    ├─ descarta si requestId es obsoleto
    ├─ recent.add({ id, name, sprite })   → LocalStorage
    └─ audio.playCry(pokemon.cries)       → LRU de AudioBuffers
```

## 6. Modelo de dominio

Se normaliza la respuesta de PokeAPI a un modelo propio en cuanto entra al sistema, para
que ningún componente dependa de la forma de la API externa:

```ts
interface Pokemon {
  id: number;
  name: string;
  displayName: string;                       // "Mr. Mime", no "mr-mime"
  types: PokemonType[];                      // nombre + color del token
  sprite: string;                            // sprites.other['official-artwork'].front_default
  spriteFallback: string;                    // sprites.front_default
  heightM: number;                           // la API entrega decímetros
  weightKg: number;                          // la API entrega hectogramos
  abilities: { name: string; hidden: boolean }[];
  stats: { key: StatKey; label: string; value: number }[];   // 6 entradas, orden fijo
  cries: { latest?: string; legacy?: string };
}
```

Verificado en la API: `sprites.other` expone `official-artwork`, `home`, `showdown` y
`dream_world`; `stats` llega en orden fijo (`hp`, `attack`, `defense`, `special-attack`,
`special-defense`, `speed`).

## 7. Presupuestos de rendimiento

| Métrica | Objetivo | Cómo se logra |
|---|---|---|
| Tecla → sugerencia visible | < 30 ms | Filtrado en memoria; sin red (ADR-02) |
| Tecla → blip audible | < 20 ms | Síntesis sin descarga ni decodificación (ADR-05) |
| Peticiones de autocompletado al escribir "charizard" | **0** | ADR-02 |
| Re-renders durante la inclinación 3D | **0** | Escritura directa al DOM vía ref (ADR-06) |
| JS inicial | < 150 KB gzip | Sin dependencias de producción nuevas |
| Descarga por sesión recurrente | ~0 KB para el índice | Persistencia en LocalStorage con TTL |

## 8. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Término inexistente (404) | `status='notfound'`, panel `>> ESPÉCIMEN NO REGISTRADO`; el input conserva el texto |
| Fallo de red en el detalle | `status='error'`, mensaje distinto del anterior, con botón reintentar |
| Fallo al cargar el índice | Modo `remote` (ADR-02), aviso discreto, la búsqueda sigue funcionando |
| LocalStorage no disponible | `services/storage.ts` envuelve todo acceso en `try/catch` y devuelve `null`; el historial vive solo en memoria |
| Web Audio no soportado / grito indecodificable | Se continúa en silencio, sin mensaje de error |
| `AbortError` | Se ignora: es el resultado esperado de una cancelación, no un fallo |

## 9. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Safari no decodifica Ogg Vorbis | Respaldo a `cries.legacy`; si falla, silencio limpio (ADR-05) |
| Cuota de LocalStorage superada por el índice (93 KB) | `try/catch` en la escritura; sin persistencia la app funciona igual, solo re-descarga |
| El índice de 1351 entradas crece en futuras generaciones | El filtrado es O(n) sobre nombres cortos; hay margen de un orden de magnitud antes de necesitar un trie |
| `backdrop-filter` costoso en GPU integradas | Número acotado de capas con blur; nunca blur sobre un elemento que anima su posición |
| PokeAPI cambia la forma de la respuesta | La normalización de §6 aísla el cambio a un único módulo |

## 10. Plan de implementación (Fase 2)

Orden propuesto, cada paso dejando la aplicación en estado ejecutable:

| # | Historia | Entrega verificable |
|---|---|---|
| 1 | Cimientos: limpieza del andamiaje, `tokens.css`, `types/pokemon.ts` | `npm run dev` con el fondo Holo-UI |
| 2 | `services/`: `storage`, `lru`, `pokeApi`, `pokeIndex` | Índice cargado y persistido, visible en DevTools |
| 3 | `useAudio` + `AudioProvider` + `AudioToggle` | Blip audible al escribir en un input de prueba |
| 4 | `usePokeSearch` + `useDebouncedValue` | Sugerencias correctas con 0 peticiones de red |
| 5 | `SearchTerminal` + `SuggestionList` (combobox ARIA) | Búsqueda completa por teclado |
| 6 | `useRecentSearches` + `RecentSearches` | Historial visible al enfocar, persistente |
| 7 | `pokeApi.getPokemon` + `SpecimenCard` + `StatBars` + grito | Ficha completa con audio |
| 8 | `useTilt` + `RadarLoader` + `BootSequence` | Experiencia Holo-UI completa |
| 9 | Pulido: accesibilidad, movimiento reducido, errores, responsive | Definición de Terminado del PRD cumplida |
