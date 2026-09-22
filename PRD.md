# PRD — PokeSearch "Holo-UI"

| Campo | Valor |
|---|---|
| Producto | PokeSearch — Terminal Científica de Investigación Pokémon |
| Versión del documento | 1.0 |
| Fase BMAD | Fase 1 — Agentic Planning |
| Rol autor | Product Manager |
| Estado | **Pendiente de aprobación** |
| Fuente de datos | PokeAPI v2 (`https://pokeapi.co/api/v2`) — pública, sin API key |

---

## 1. Visión del producto

PokeSearch no es una Pokédex. Es una **terminal de investigación científica** donde un
analista consulta especímenes en una base de datos remota. La búsqueda no "carga
resultados": **adquiere señal**, la decodifica y la proyecta sobre un panel holográfico.

La tesis del producto es que en un dominio tan saturado como los buscadores de Pokémon,
la diferenciación no está en el dato — todos consumen la misma PokeAPI — sino en la
**densidad sensorial de la interacción**: cada tecla suena, cada resultado se materializa,
cada panel responde físicamente al cursor. El objetivo es que el usuario quiera seguir
escribiendo aunque ya haya encontrado lo que buscaba.

## 2. Usuarios objetivo

| Persona | Contexto | Necesidad dominante |
|---|---|---|
| **El consultante rápido** | Sabe qué Pokémon busca, quiere el dato en segundos | Autocompletado que acierte al 3.º carácter; cero fricción |
| **El explorador** | No sabe qué busca, navega por curiosidad | Sugerencias visibles, historial, descubrimiento |
| **El evaluador** (docente/reclutador) | Evalúa la calidad técnica y de diseño | Que la interfaz se sienta imposible de haber sido hecha con una plantilla |

## 3. Objetivos y métricas de éxito

| Objetivo | Métrica verificable |
|---|---|
| Búsqueda instantánea | Sugerencias visibles en **< 30 ms** desde la pulsación (sin red en el camino crítico) |
| Audio imperceptiblemente rápido | Latencia tecla → "blip" **< 20 ms**; nunca bloquea el `input` |
| Carga inicial ligera | First Contentful Paint **< 1.5 s** en 3G rápida; bundle JS inicial **< 150 KB** gzip |
| Cero llamadas redundantes | Escribir "charizard" (9 teclas) debe producir **0 peticiones** de autocompletado a la red |
| Accesible pese al espectáculo | Navegable 100 % por teclado; respeta `prefers-reduced-motion` |

## 4. Alcance

### 4.1 Dentro del alcance (v1)

- Búsqueda global de Pokémon por nombre o número de Pokédex.
- Autocompletado en tiempo real mientras se escribe.
- Panel de Búsquedas Recientes persistido en LocalStorage.
- Ficha de detalle del espécimen con inclinación 3D.
- Audio: "blip" por tecla + grito oficial del Pokémon.
- Diseño Holo-UI completo (glassmorphism, secuencia de arranque retro, animaciones).
- Controles de sonido y de movimiento reducido.

### 4.2 Fuera del alcance (v1)

- Comparador de dos o más Pokémon.
- Cadenas evolutivas, movimientos, localizaciones, formas alternas.
- Filtros por tipo/generación, favoritos sincronizados, cuentas de usuario.
- Modo claro (la identidad del producto es deliberadamente oscura).
- Internacionalización más allá de español en la UI.

---

## 5. Requerimientos funcionales

### FR-01 — Buscador global

El usuario puede consultar cualquier Pokémon del índice completo de PokeAPI
(**1351 entradas verificadas**, incluidas formas regionales y mega-evoluciones)
por nombre o por número de Pokédex.

**Criterios de aceptación**
- Aceptar texto libre; normalizar a minúsculas y recortar espacios antes de consultar.
- Aceptar un número (`25`) y resolverlo al espécimen correspondiente.
- `Enter` sin sugerencia seleccionada ejecuta la búsqueda del texto literal.
- Un término inexistente muestra un error en lenguaje de terminal
  (`>> ESPÉCIMEN NO REGISTRADO EN EL ARCHIVO`), nunca un stack trace ni una pantalla vacía.
- Un fallo de red se distingue visualmente de un "no encontrado" y ofrece reintentar.

### FR-02 — Autocompletado en tiempo real

A medida que el usuario escribe, aparece una lista de coincidencias.

**Criterios de aceptación**
- Las sugerencias se actualizan sin intervención del usuario, a partir del **1.er carácter**.
- Ordenación por relevancia: primero coincidencias por prefijo, luego por subcadena,
  ambas alfabéticas dentro de su grupo.
- Máximo **8 sugerencias** visibles; la porción coincidente del texto se resalta.
- Navegación con `↑` / `↓`, selección con `Enter` o `Tab`, cierre con `Esc`.
- Selección con ratón/táctil equivalente a la del teclado.
- Escribir rápido **nunca** debe producir parpadeo, listas desordenadas ni resultados
  de un término anterior sobreescribiendo los del actual (condición de carrera).
- Sin coincidencias: la lista muestra `>> SIN COINCIDENCIAS EN EL ÍNDICE`, no desaparece
  en silencio.

### FR-03 — Búsquedas recientes

**Criterios de aceptación**
- Al hacer **foco en el input con el campo vacío**, el panel de recientes es visible
  **de inmediato**, sin esperar a que el usuario escriba.
- Persiste en LocalStorage entre sesiones y recargas.
- Máximo **8 entradas**, orden MRU (la más reciente primero), sin duplicados:
  repetir una búsqueda la promueve al principio en vez de añadirla de nuevo.
- Cada entrada guarda nombre, id y sprite en miniatura para reconocimiento visual inmediato.
- Existe acción de borrar una entrada individual y de purgar el historial completo.
- Si LocalStorage no está disponible (modo privado, cuota llena), la app funciona
  normalmente con el historial solo en memoria; **nunca lanza un error al usuario**.

### FR-04 — Ficha del espécimen

**Criterios de aceptación**
- Muestra: artwork oficial, nombre, número de Pokédex, tipos (con color por tipo),
  altura, peso, habilidades y las 6 estadísticas base.
- Las estadísticas se animan desde 0 hasta su valor con barras de carga tipo instrumento.
- La tarjeta responde a la posición del puntero con **inclinación 3D** y un reflejo
  (glare) que sigue al cursor.
- La inclinación se desactiva por completo bajo `prefers-reduced-motion` y en táctil.

### FR-05 — Audio de teclado

**Criterios de aceptación**
- Cada carácter insertado dispara un "blip" cibernético corto y sutil.
- El sonido es **sintetizado en tiempo real** (Web Audio API), no un archivo descargado:
  latencia cercana a cero y cero peticiones de red.
- Ligera variación de tono entre pulsaciones para evitar fatiga auditiva.
- Borrar (`Backspace`) produce una variante más grave y corta.
- Escribir a 15 pulsaciones por segundo no degrada el rendimiento del input ni satura
  la salida de audio (limitación de disparos).
- El audio **nunca** bloquea ni retrasa la aparición del carácter en pantalla.

### FR-06 — Grito oficial del Pokémon

**Criterios de aceptación**
- Al seleccionar un espécimen se reproduce su grito, tomado de la propiedad `cries`
  que el endpoint principal ya devuelve: `cries.latest` (preferido) y `cries.legacy`
  (respaldo). Verificado: `.ogg`, ~7 KB, servido con `Access-Control-Allow-Origin: *`.
- El volumen del grito se normaliza para no sobresaltar respecto al blip de teclado.
- Seleccionar otro Pokémon corta el grito anterior; nunca se solapan dos gritos.
- Si el navegador no puede decodificar el formato, la app continúa en silencio
  **sin mostrar error**.
- Existe un botón para repetir el grito desde la ficha.

### FR-07 — Control de sonido

**Criterios de aceptación**
- Interruptor de silencio global visible y accesible por teclado.
- La preferencia persiste en LocalStorage.
- El audio respeta la política de autoplay del navegador: el contexto de audio se
  inicializa con el primer gesto real del usuario, no al cargar la página.

### FR-08 — Mapa de avistamientos

Una segunda vista, conmutable con la ficha, sitúa los datos en el espacio.

**Contexto que condiciona el requerimiento:** PokeAPI **no expone coordenadas**
de ningún tipo. La jerarquía real que sí ofrece es región → localización → zona →
encuentros. El mapa es por tanto un **radar de sectores**: las 11 regiones ocupan
un sector cada una y las localizaciones se sitúan dentro del suyo mediante un
hash determinista de su nombre.

**Criterios de aceptación**
- Con un espécimen cargado, el radar ilumina las localizaciones donde aparece; el
  tamaño y el brillo del nodo son proporcionales a su probabilidad de encuentro.
- Cada avistamiento indica región, probabilidad, método de captura, rango de
  niveles y número de ediciones en las que aparece.
- Pulsar una localización abre su **expediente**: qué especies la habitan y con
  qué probabilidad. Es la dirección inversa de la consulta.
- Desde el expediente se puede elegir una especie y analizarla, cerrando el ciclo
  espécimen → lugar → espécimen.
- Sin espécimen cargado, pulsar un sector del radar recorre las localizaciones de
  esa región.
- Un espécimen sin avistamientos salvajes (evoluciones, legendarios, formas
  especiales) recibe una explicación, no un mapa vacío sin más.
- Todo lo que muestra el radar está también en una lista contigua operable por
  teclado; el SVG es una representación redundante y se oculta a los lectores de
  pantalla.
- El coste de la geografía no lo paga quien no la usa: el callejero solo se
  descarga al abrir el mapa por primera vez.

---

## 6. Requerimientos de experiencia — "Holo-UI"

El lenguaje visual se aleja explícitamente de la Pokédex roja y de la grilla de tarjetas.

### 6.1 Metáfora

Una consola de análisis: fondo profundo casi negro con un gradiente frío, una **rejilla
en perspectiva** que se pierde en el horizonte, partículas de datos flotando, y paneles
de **vidrio esmerilado** (`backdrop-filter: blur()`) suspendidos sobre ella con bordes
luminosos de 1 px.

### 6.2 Paleta

| Rol | Color |
|---|---|
| Fondo profundo | `#050813` |
| Vidrio | blanco al 4–6 % de opacidad + blur 20 px |
| Cian primario (señal) | `#22E9F5` |
| Magenta secundario (acento) | `#F548C4` |
| Ámbar (alerta/estado) | `#FFB347` |
| Texto | `#DCE8F5` / `#7E8FA6` (atenuado) |

Los colores de tipo Pokémon se usan **solo** dentro de la ficha, como luz emitida
(halos, brillos), nunca como relleno plano: el tipo del espécimen tiñe sutilmente el
resplandor de toda la interfaz.

### 6.3 Tipografía

Monoespaciada para todo dato de sistema (ids, estadísticas, mensajes de terminal) y una
sans geométrica de peso alto para el nombre del espécimen. La UI habla en mayúsculas
cortas con prefijo `>>` para los mensajes de estado.

### 6.4 Momentos animados obligatorios

1. **Secuencia de arranque retro** — al abrir la app, una terminal escribe línea a línea
   la inicialización del sistema (`>> CONECTANDO A ARCHIVO CENTRAL…`, `>> ÍNDICE: 1351
   ESPECÍMENES`) con cursor parpadeante y líneas de escaneo CRT. Duración máxima **1.8 s**,
   y **saltable** con cualquier tecla o clic.
2. **Barrido de radar** durante la carga de un espécimen: un cono giratorio recorre el
   panel vacío.
3. **Materialización** de la ficha: entra con desenfoque + desplazamiento + un destello
   de "línea de escaneo" que la recorre de arriba abajo una vez.
4. **Conteo ascendente** de las estadísticas con barras que se llenan escalonadamente.
5. **Inclinación 3D** permanente y reactiva al puntero sobre la ficha.
6. **Aparición escalonada** de las sugerencias de autocompletado (retardo por índice).

### 6.5 Responsive

- **Escritorio (≥ 1024 px):** buscador centrado con el panel de datos a la derecha.
- **Tablet (640–1023 px):** columna única, ficha bajo el buscador.
- **Móvil (< 640 px):** una sola columna, tipografía reducida, inclinación 3D desactivada,
  panel de recientes a pantalla completa al enfocar. Sin desplazamiento horizontal
  en ningún ancho.

### 6.6 Accesibilidad

- El buscador implementa el patrón ARIA **combobox** completo
  (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`).
- Todo el flujo (buscar → sugerir → seleccionar → repetir grito → silenciar) es operable
  solo con teclado, con foco visible de alto contraste.
- Los cambios de estado se anuncian en una región `aria-live="polite"`.
- Contraste mínimo 4.5:1 en texto sobre vidrio (se verifica el peor caso, no el promedio).
- Con `prefers-reduced-motion: reduce`: sin inclinación, sin parallax, sin barrido;
  las transiciones se reducen a fundidos de 80 ms. La app sigue siendo plenamente usable.

---

## 7. Requerimientos no funcionales

| ID | Requerimiento |
|---|---|
| NFR-01 | **Debounce** en el input para desacoplar el ritmo de tecleo del ritmo de cómputo y de red. |
| NFR-02 | **Caché local** de peticiones asíncronas: una consulta ya resuelta no vuelve a la red durante la sesión. |
| NFR-03 | Toda petición en vuelo es **cancelable**; una respuesta obsoleta jamás pisa a una más reciente. |
| NFR-04 | Escribir rápido no debe encolar peticiones ni bloquear la interfaz (requisito explícito del cliente). |
| NFR-05 | La app degrada con dignidad sin red, sin LocalStorage y sin audio, en ese orden de probabilidad. |
| NFR-06 | Navegadores objetivo: últimas 2 versiones de Chrome, Edge, Firefox y Safari. |
| NFR-07 | Sin claves ni secretos: PokeAPI es pública. No se envía ningún dato del usuario a terceros. |
| NFR-08 | Uso respetuoso de la API pública: minimizar peticiones y aprovechar su `cache-control: max-age=86400`. |

---

## 8. Épicas (insumo para la Fase 2)

| Épica | Descripción | Depende de |
|---|---|---|
| **E1 — Cimientos** | Proyecto Vite, tokens de diseño, capa de datos y caché de PokeAPI | — |
| **E2 — Motor de búsqueda** | `usePokeSearch`, debounce, índice, ranking, cancelación | E1 |
| **E3 — Motor de audio** | `useAudio`, síntesis del blip, reproducción de gritos, silencio | E1 |
| **E4 — Shell Holo-UI** | Fondo, rejilla, vidrio, arranque retro, layout responsive | E1 |
| **E5 — Buscador e historial** | Input combobox, sugerencias, recientes en LocalStorage | E2, E3, E4 |
| **E6 — Ficha del espécimen** | Datos, inclinación 3D, animación de estadísticas, grito | E2, E3, E4 |
| **E7 — Pulido** | Accesibilidad, movimiento reducido, estados de error, rendimiento | Todas |

## 9. Riesgos de producto

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El audio por tecla resulta molesto en uso prolongado | Alto | Volumen bajo por defecto, variación de tono, silencio de un clic y persistente |
| El exceso de efectos entorpece la búsqueda real | Alto | Las animaciones nunca retrasan el dato: la ficha es legible antes de terminar de animar |
| `backdrop-filter` penaliza el rendimiento en equipos modestos | Medio | Número acotado de capas con blur; sin blur sobre elementos que animan su posición |
| La secuencia de arranque irrita en la segunda visita | Medio | Saltable con cualquier tecla; versión abreviada tras la primera visita (LocalStorage) |
| PokeAPI caído o con latencia | Bajo | Caché persistente del índice; mensajes de error en carácter, con reintento |

## 10. Definición de Terminado (v1)

- Los siete requerimientos funcionales cumplen todos sus criterios de aceptación.
- Recorrido completo operable solo con teclado y verificado con `prefers-reduced-motion`.
- Escribir "charizard" produce **cero** peticiones de autocompletado a la red (verificable
  en la pestaña Red del navegador).
- Sin errores ni advertencias en consola durante el recorrido principal.
- Funciona tras recargar con la red desconectada, al menos para el índice y el historial.
- `npm run build` y `npm run lint` pasan sin errores.
