# NOMBRE ESTUDIANTE:
Alejandro Caycedo Montero

#LINK DESPLEGADO:
https://acaycedo24.github.io/base-pokedex-20262-alejandrocaycedo/

# PokeSearch — Terminal de Archivo Pokémon

Una Pokédex que no parece una Pokédex. En lugar de la clásica carcasa roja con
una rejilla de tarjetas, PokeSearch es una **terminal de investigación
científica**: un analista consulta especímenes en un archivo remoto, la búsqueda
no «carga resultados» sino que *adquiere señal*, y cada dato se proyecta sobre un
panel holográfico que responde al movimiento del cursor.

**→ [Ver la aplicación en funcionamiento](https://acaycedo24.github.io/base-pokedex-20262-alejandrocaycedo/)**

Proyecto de Desarrollo Web · Universidad de La Sabana · Tercer semestre.

---

## Qué hace

**Buscador global** sobre los 1351 especímenes de la PokeAPI —incluidas formas
regionales y megaevoluciones— con autocompletado que responde desde la primera
letra, historial persistente y búsqueda por nombre o por número de Pokédex.

**Mapa de avistamientos** en forma de radar: las 11 regiones ocupan un sector cada
una y se iluminan las localizaciones donde vive el espécimen consultado, con el
brillo proporcional a la probabilidad de encuentro. Funciona en las dos
direcciones: también puedes abrir un lugar y ver qué especies lo habitan.

**Experiencia sensorial.** Cada tecla produce un «blip» cibernético sintetizado en
tiempo real, y al seleccionar un Pokémon suena su grito oficial.

---

## Lo que merece la pena mirar

Tres decisiones técnicas que separan este proyecto de un consumo directo de la
API. Las tres están medidas contra la API en vivo, no estimadas.

### 1. El autocompletado no toca la red

La PokeAPI **no tiene endpoint de búsqueda por prefijo**, así que filtrar en
cliente no es una optimización: es la única forma correcta de hacer
autocompletado contra ella.

PokeSearch descarga el catálogo completo una sola vez —**93 KB, 1351 entradas,
0.28 s**— y lo persiste en LocalStorage. A partir de ahí el filtrado ocurre en
memoria.

> Escribir `charizard` produce **0 peticiones** de autocompletado.
> El enfoque ingenuo de una petición por término generaría 9, con sus
> condiciones de carrera y su dependencia de la latencia.
>
> Compruébalo en DevTools → pestaña Red.

### 2. El sonido del teclado se sintetiza, no se descarga

Un archivo de audio, por pequeño que sea, implica red, decodificación y un primer
disparo tardío. Cada pulsación construye en su lugar un grafo efímero de Web
Audio:

```
OscillatorNode (onda cuadrada, 620–900 Hz con variación aleatoria)
  → GainNode (ataque 1 ms → caída exponencial 18 ms)
    → masterGain → salida
```

Más un golpe de ruido filtrado en paso alto que aporta el clic mecánico. Coste:
microsegundos y cero bytes. Los gritos sí se descargan, pero se guardan ya
decodificados como `AudioBuffer`, así que repetirlos es instantáneo.

### 3. El mapa se construye: la PokeAPI no tiene coordenadas

No existe latitud, longitud ni posición en ningún endpoint. Lo que sí hay es una
jerarquía consultable: `región → localización → zona → encuentros`.

El radar sitúa cada localización dentro del sector de su región mediante un hash
determinista de su nombre, de modo que **siempre cae en el mismo punto** sin
almacenar una sola coordenada.

El obstáculo real era otro: el endpoint de encuentros devuelve zonas sin decir a
qué región pertenecen, y averiguarlo por la API cuesta dos peticiones por zona —
80 para Pikachu y **574 para Magikarp**. La solución es un callejero local de 1013
localizaciones (11 peticiones, una vez) y resolución por prefijo más largo:

| Comprobación | Resultado |
|---|---|
| Cobertura sobre las 1539 zonas existentes | **100 %** |
| Exactitud contra `/location-area/{id}`, muestra de 20 | **20/20** |
| Zonas sin resolver en 5 Pokémon (402 zonas) | **0** |

---

## Stack

| Capa | Elección |
|---|---|
| Framework | React 19 |
| Lenguaje | TypeScript 6 |
| Build | Vite 8 |
| Enrutado | React Router 7 |
| Estilos | CSS Modules + custom properties |
| Datos | `fetch` nativo sobre [PokeAPI](https://pokeapi.co/) |
| Audio | Web Audio API |
| Lint | oxlint |

**Una única dependencia de producción: `react-router-dom`.** La caché, el motor de
audio, el mapa y todas las animaciones están construidos sobre React y la
plataforma web, sin librerías de terceros.

Bundle final: **99.6 KB gzip.**

---

## Cómo ejecutarlo

Necesitas [Node.js](https://nodejs.org/) 20 o superior.

```bash
git clone https://github.com/acaycedo24/base-pokedex-20262-alejandrocaycedo.git
cd base-pokedex-20262-alejandrocaycedo
npm install
npm run dev
```

Abre <http://localhost:5173>.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila tipos y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para probar la versión final |
| `npm run lint` | Analiza el código con oxlint |

No hace falta ninguna clave: la PokeAPI es pública.

---

## Cómo probarlo

1. Escribe `char` — suena el blip por tecla y aparecen las sugerencias.
2. Pulsa Enter sobre **Charizard** — barrido de radar, la ficha se materializa y
   suena su grito.
3. Mueve el ratón sobre la ficha — inclinación 3D con reflejo siguiendo al cursor.
4. Pestaña **Mapa de avistamientos** — el radar ilumina dónde vive.
5. Pulsa una zona y luego una especie de las que la habitan — la URL cambia, el
   expediente sigue abierto y el botón Atrás funciona.
6. Vuelve a hacer clic en el campo vacío — ahí está tu historial.

Todo el recorrido es operable **solo con teclado**, y la aplicación respeta
`prefers-reduced-motion`: con movimiento reducido desaparecen la inclinación, el
barrido y la secuencia de arranque, sin perder ninguna funcionalidad.

---

## Estructura

```
src/
├── components/     Componentes de interfaz, cada uno con su CSS Module
├── pages/          Una por ruta: inicio, ficha, mapa y 404
├── hooks/          useAudio, useSearchBox, usePokemon, usePokeMap, useTilt…
├── services/       Acceso a la API, caché, índice local y callejero
├── context/        Proveedores de audio e historial
├── types/          Modelos de dominio
├── utils/          LRU y formato
└── styles/         Tokens de diseño y animaciones compartidas
```

| Ruta | Vista |
|---|---|
| `/` | Terminal en reposo |
| `/pokemon/:name` | Ficha del espécimen |
| `/pokemon/:name/mapa` | Sus avistamientos |
| `/mapa` | Exploración libre de regiones |
| `?zona=<id>` | Expediente de una localización |

---

## Documentación

El proyecto se desarrolló con la metodología **BMAD**: primero planificación, y
solo después código.

| Documento | Contenido |
|---|---|
| [PRD.md](PRD.md) | Requerimientos de producto: qué se construye y por qué |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Decisiones técnicas (ADR) con sus alternativas descartadas |
| [CONCEPTOS.md](CONCEPTOS.md) | Los conceptos de React aplicados, con la línea exacta donde vive cada uno |

---

## Créditos

Datos e imágenes: [PokeAPI](https://pokeapi.co/), proyecto de código abierto y uso
gratuito.

Pokémon y sus nombres son marcas registradas de Nintendo, Game Freak y The Pokémon
Company. Este es un proyecto académico sin ánimo de lucro y sin afiliación alguna
con ellos.
