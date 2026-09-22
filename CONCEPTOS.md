# Conceptos de React aplicados en PokeSearch

Este documento conecta los conceptos vistos en clase con el sitio exacto del
código donde se usan y, sobre todo, con **el problema concreto que resuelven
aquí**. Un patrón sin un problema detrás es solo ceremonia.

---

## 1. Render y estado

> *Render: cambio en el estado.*

Un componente se vuelve a renderizar cuando su estado cambia. En PokeSearch el
caso más visible es el buscador: cada tecla actualiza `term` y eso redibuja la
lista de sugerencias.

**Dónde:** [`useSearchBox.ts`](src/hooks/useSearchBox.ts)

```ts
const [term, setTermState] = useState('');
```

**El matiz que importa aquí.** El render es *puro*: debe poder ejecutarse varias
veces sin consecuencias. Por eso las partículas del fondo se sortean fuera del
componente, al cargar el módulo:

```ts
// HoloBackground.tsx
const PARTICLES = Array.from({ length: 28 }, () => ({ left: `${Math.random() * 100}%`, … }));
```

Si `Math.random()` se llamara durante el render, en modo estricto React
renderizaría dos veces y las partículas saltarían de sitio. El linter del
proyecto (`oxlint`) marca esto como `react(purity)`.

---

## 2. Props: del padre al hijo

> *props: padre e hijo.*

Los datos bajan; los eventos suben. El ejemplo más claro es el buscador: no sabe
qué significa elegir un Pokémon. Recibe una función de su padre y la llama.

**Hijo** — [`SearchTerminal.tsx`](src/components/SearchTerminal/SearchTerminal.tsx)

```tsx
interface Props {
  box: UseSearchBox;
  onSelect: (name: string) => void;  // el padre decide qué ocurre
  busy: boolean;
}
```

**Padre** — [`Layout.tsx`](src/components/Layout/Layout.tsx)

```tsx
<SearchTerminal box={box} onSelect={handleSelect} busy={specimen.status === 'loading'} />
```

Gracias a eso, `SearchTerminal` no importa el Router. Se podría reutilizar en
otra aplicación sin tocar una línea.

### Cuándo las props no sirven: Context

Cuando el que escribe un dato y el que lo lee están muy separados en el árbol,
pasarlo por props obliga a atravesar componentes intermedios que no lo usan
(*prop drilling*). En PokeSearch pasa dos veces:

| Dato | Provider | Por qué |
|---|---|---|
| Audio | [`AudioProvider.tsx`](src/context/AudioProvider.tsx) | Un único `AudioContext` para toda la app |
| Historial | [`RecentProvider.tsx`](src/context/RecentProvider.tsx) | Lo **escribe** `usePokemon` y lo **lee** el panel del buscador, en ramas distintas |

El historial es un buen ejemplo de por qué hacía falta: antes cada componente
llamaba a su propio `useRecentSearches()`, así que tenían **dos estados
independientes** y el panel nunca se enteraba de las búsquedas nuevas.

---

## 3. useEffect: sincronizar con el mundo exterior

> *useEffect es la acción secundaria de cambiar algo, es el ciclo de vida.*

Una formulación más útil en la práctica: **useEffect sirve para sincronizar el
componente con algo que vive fuera de React** — la red, el reloj, el navegador,
la barra de direcciones. Si un valor se puede *calcular* a partir de otros, no
necesita un efecto.

### Ejemplo 1 — La red

[`usePokemon.ts`](src/hooks/usePokemon.ts)

```ts
useEffect(() => {
  const controller = new AbortController();
  getPokemon(query, controller.signal).then(/* … */);
  return () => controller.abort();   // ← limpieza
}, [query, attempt, add, playCry]);
```

Las tres partes del ciclo de vida están aquí:

| Fase | En el código |
|---|---|
| Montaje / cambio de dependencias | el cuerpo del efecto lanza la petición |
| Desmontaje / siguiente ejecución | el `return` cancela la anterior |
| Guardia | `if (controller.signal.aborted) return;` |

Sin el `return`, buscar rápido dejaría peticiones vivas y una respuesta antigua
podría pisar a una reciente.

### Ejemplo 2 — La URL

[`Layout.tsx`](src/components/Layout/Layout.tsx)

```ts
useEffect(() => {
  if (routeName) syncTerm(toDisplayName(routeName));
}, [routeName, syncTerm]);
```

Al entrar por un enlace a `/pokemon/pikachu`, el campo de búsqueda debe mostrar
«Pikachu». La barra de direcciones es un sistema externo: caso legítimo.

### Cuándo NO usar useEffect

Esto es lo que más cuesta, y en este proyecto costó un bug. La primera versión
del mapa hacía esto:

```ts
// ❌ mal: reiniciar estado desde un efecto
useEffect(() => { setDossier(null); }, [pokemonId]);
```

Provoca un render extra y, peor aún, deja un instante con datos incoherentes.
La forma correcta es **guardar a quién pertenece el dato y derivarlo**:

```ts
// ✅ bien: se deriva durante el render
const dossierMatch = dossierState.forLocation === zoneId;
const dossier = dossierMatch ? dossierState.data : null;
```

Está en [`usePokeMap.ts`](src/hooks/usePokeMap.ts). El linter marca el patrón
malo como `react(set-state-in-effect)`.

---

## 4. Router: mapear una URL a un componente

> *Router: es lo que nos conecta y nos permite mapear una URL a un componente.
> `/users` → `users.jsx`*

**Dónde:** [`App.tsx`](src/App.tsx)

```tsx
<Routes>
  <Route element={<Layout />}>
    <Route path="/"                   element={<HomePage />} />
    <Route path="/mapa"               element={<MapPage />} />
    <Route path="/pokemon/:name"      element={<SpecimenPage />} />
    <Route path="/pokemon/:name/mapa" element={<MapPage />} />
    <Route path="*"                   element={<NotFoundPage />} />
  </Route>
</Routes>
```

`Layout` es una **ruta padre**: envuelve a todas y nunca se desmonta. Por eso el
buscador vive ahí — pasar de la ficha al mapa no pierde el texto escrito.
`<Outlet/>` es el hueco donde se monta la página que corresponda.

### El parámetro dinámico

`:name` es la parte variable. Se lee con `useMatch` en el layout:

```ts
const match = useMatch('/pokemon/:name/*');
const routeName = match?.params.name;
```

Y de ahí sale el Pokémon cargado. **La URL es la fuente de verdad**, no el
estado de ningún componente.

### La URL como estado

El caso más interesante es la zona abierta del mapa, en
[`MapPage.tsx`](src/pages/MapPage.tsx):

```ts
const [params, setParams] = useSearchParams();
const zoneId = /^\d+$/.test(params.get('zona') ?? '') ? Number(params.get('zona')) : null;
```

Meter ese dato en la URL en lugar de en `useState` regala tres cosas:

1. `/pokemon/pikachu/mapa?zona=99` se puede compartir y funciona.
2. El botón **Atrás** del navegador cierra el expediente.
3. **Arregló un bug real**: antes el expediente se guardaba junto al Pokémon que
   lo había pedido y se borraba al elegir una especie dentro de él — justo en el
   momento del clic.

---

## 5. SPA: no recargar, no perder el estado

> *spa: single page application. Para eso usar react-router-dom, para evitar
> recargar constantemente la página. Al recargar se pierde el estado/memoria.*

Exacto, y en PokeSearch se pierde bastante:

| Lo que sobrevive a `navigate()` | Lo que se perdería al recargar |
|---|---|
| El índice de 1351 especímenes en memoria | Habría que releerlo de LocalStorage |
| El callejero de 1013 localizaciones | Igual |
| La caché LRU de Pokémon ya consultados | Se vacía entera |
| Los gritos ya decodificados (`AudioBuffer`) | Se pierden, hay que volver a descargar y decodificar |
| El `AudioContext` desbloqueado | Vuelve a estado `suspended` |

Ese último es el más molesto: los navegadores solo permiten arrancar audio tras
un gesto del usuario, así que al recargar el primer «blip» se pierde otra vez.

**Cómo se navega sin recargar:**

```tsx
navigate(`/pokemon/${slug}`);   // en manejadores de eventos
<Link to="/mapa">Mapa</Link>    // en la interfaz
```

Lo que **no** hay que usar: `<a href="/mapa">` ni `window.location = …`. Ambos
piden una página nueva al servidor y tiran todo lo de la tabla.

### La contrapartida en despliegue

Como el servidor no conoce `/pokemon/pikachu`, hay que decirle que sirva
`index.html` para cualquier ruta. Por eso existe
[`public/_redirects`](public/_redirects). En desarrollo Vite ya lo hace solo.

---

## 6. React.memo: evitar re-renders

> *por defecto en React casi todos los componentes se re-renderizan al
> renderizarse su padre.*

Correcto. Cuando un padre se renderiza, sus hijos se renderizan también aunque
sus props no hayan cambiado.

### Una corrección de sintaxis

`memo` **no es un componente que se envuelve en JSX**. Es una función que recibe
un componente y devuelve otro:

```tsx
// ❌ no existe
<React.Memo>
  <Component />
</React.Memo>

// ✅ así es
const Component = memo(ComponentImpl);
```

### Dónde se aplica aquí

| Componente | Por qué |
|---|---|
| [`SuggestionList`](src/components/SuggestionList/SuggestionList.tsx) | El padre se renderiza en **cada tecla**; la lista suele ser la misma |
| [`RecentSearches`](src/components/RecentSearches/RecentSearches.tsx) | Cambia solo al buscar algo nuevo |
| [`HoloMap`](src/components/HoloMap/HoloMap.tsx) | Dibuja más de mil nodos SVG |
| [`SpecimenCard`](src/components/SpecimenCard/SpecimenCard.tsx) | Depende de un solo objeto, que viene de la caché |
| [`StatBars`](src/components/StatBars/StatBars.tsx) | Seis contadores animados que no deben reiniciarse |
| [`HoloBackground`](src/components/HoloBackground/HoloBackground.tsx) | 28 partículas animadas, sin props |

### La trampa: memo no sirve solo

`memo` compara las props **por identidad**. Una función creada en el render es
un objeto nuevo cada vez, así que rompe la comparación:

```tsx
// ❌ memo no sirve de nada: onSelect es distinta en cada render
<SearchTerminal onSelect={(name) => navigate(`/pokemon/${name}`)} />
```

Por eso en [`Layout.tsx`](src/components/Layout/Layout.tsx) va con `useCallback`:

```tsx
const handleSelect = useCallback((name: string) => { … }, [navigate, onMapRoute]);
```

`memo` + `useCallback` van juntos o no funciona ninguno de los dos.

### Dónde memo NO ayuda

`AudioToggle` no está memoizado a propósito: consume Context, y **un cambio de
Context atraviesa `memo`**. Memoizarlo daría una falsa sensación de optimización.

---

## 7. El estado es inmutable

> *el estado en React es inmutable, la única manera es destruirlo y volverlo a
> hacer.*

Nunca se modifica el estado anterior: se construye uno nuevo. React compara por
identidad (`===`) para decidir si hay que renderizar, así que mutar un array no
dispara nada.

```ts
// ❌ React no se entera: es el mismo array
prev.unshift(entry);
return prev;

// ✅ array nuevo
return [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, max);
```

**Dónde:** [`useRecentSearches.ts`](src/hooks/useRecentSearches.ts). Ese
`filter` + propagación implementa además la semántica MRU: repetir una búsqueda
la promueve al principio en lugar de duplicarla.

### El giro: a veces conviene devolver el mismo objeto

La inmutabilidad tiene la cara B. Si el resultado es equivalente, devolver el
array **anterior** evita un render inútil:

```ts
const unchanged = next.length === prev.length && next.every((e, i) => e.id === prev[i]?.id);
return unchanged ? prev : next;
```

React ve la misma referencia y no hace nada. Es la misma regla de identidad,
usada a favor.

---

## Resumen: dónde mirar cada cosa

| Concepto | Archivo |
|---|---|
| Estado y render | [`useSearchBox.ts`](src/hooks/useSearchBox.ts) |
| Props padre → hijo | [`Layout.tsx`](src/components/Layout/Layout.tsx) → [`SearchTerminal.tsx`](src/components/SearchTerminal/SearchTerminal.tsx) |
| Context | [`AudioProvider.tsx`](src/context/AudioProvider.tsx), [`RecentProvider.tsx`](src/context/RecentProvider.tsx) |
| useEffect con limpieza | [`usePokemon.ts`](src/hooks/usePokemon.ts) |
| Derivar en vez de usar efecto | [`usePokeMap.ts`](src/hooks/usePokeMap.ts) |
| Rutas | [`App.tsx`](src/App.tsx) |
| Parámetro de ruta | [`Layout.tsx`](src/components/Layout/Layout.tsx) |
| URL como estado | [`MapPage.tsx`](src/pages/MapPage.tsx) |
| memo + useCallback | [`SearchTerminal.tsx`](src/components/SearchTerminal/SearchTerminal.tsx) |
| Inmutabilidad | [`useRecentSearches.ts`](src/hooks/useRecentSearches.ts) |
| Componente de clase | [`ErrorBoundary.tsx`](src/components/ErrorBoundary/ErrorBoundary.tsx) |
