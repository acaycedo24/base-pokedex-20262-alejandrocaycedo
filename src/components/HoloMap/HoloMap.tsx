import { memo, useMemo, useState } from 'react';
import {
  CENTER,
  INNER_RADIUS,
  MAP_SIZE,
  OUTER_RADIUS,
  SECTOR_SPAN_DEG,
  polarToXY,
  sectorStartDeg,
} from '../../services/pokeGeo';
import { REGIONS } from '../../types/geo';
import { ZoneDossier } from './ZoneDossier';
import type { UsePokeMap } from '../../hooks/usePokeMap';
import styles from './HoloMap.module.css';

interface Props {
  map: UsePokeMap;
  /** Espécimen cargado, si lo hay. Determina el modo del mapa. */
  pokemonName: string | null;
  /** Abrir una zona cambia la URL (`?zona=`); lo decide el padre. */
  onOpenZone: (locationId: number) => void;
  onCloseZone: () => void;
  onSelectPokemon: (name: string) => void;
}

/** Sector anular entre dos ángulos. Es la forma de cada región del radar. */
function wedgePath(
  startDeg: number,
  endDeg: number,
  rInner: number,
  rOuter: number,
): string {
  const a = polarToXY(startDeg, rInner);
  const b = polarToXY(startDeg, rOuter);
  const c = polarToXY(endDeg, rOuter);
  const d = polarToXY(endDeg, rInner);
  const large = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M${a.x} ${a.y}`,
    `L${b.x} ${b.y}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${c.x} ${c.y}`,
    `L${d.x} ${d.y}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${a.x} ${a.y}`,
    'Z',
  ].join(' ');
}

function HoloMapImpl({
  map,
  pokemonName,
  onOpenZone,
  onCloseZone,
  onSelectPokemon,
}: Props) {
  /* Localización señalada, para sincronizar el resalte entre la lista y el
     radar. Es estado de presentación puro, así que vive aquí. */
  const [hot, setHot] = useState<string | null>(null);

  /**
   * Las 1013 localizaciones del callejero como un único elemento `<path>`.
   *
   * Un `<circle>` por localización serían 1013 nodos del DOM solo para el
   * fondo. El truco es un segmento de longitud casi nula (`h.01`) por punto:
   * con `stroke-linecap: round` cada uno se dibuja como un punto, y todos
   * caben en un solo atributo `d`.
   */
  const backdropPath = useMemo(
    () =>
      map.backdrop
        .map((loc) => `M${loc.x.toFixed(1)} ${loc.y.toFixed(1)}h.01`)
        .join(''),
    [map.backdrop],
  );

  /** Cuántas localizaciones del espécimen caen en cada región. */
  const perRegion = useMemo(() => {
    const counts = new Array<number>(REGIONS.length).fill(0);
    for (const zone of map.zones) counts[zone.regionIndex] += 1;
    return counts;
  }, [map.zones]);

  const sweepPath = useMemo(
    () => wedgePath(-90, -90 + 42, 0, OUTER_RADIUS),
    [],
  );

  const showingDossier = map.dossierStatus !== 'idle';
  const hasZones = map.zones.length > 0;

  return (
    <section className={styles.root} aria-label="Mapa de avistamientos">
      {/* ── Radar ─────────────────────────────────────────────────────── */}
      <div className={styles.canvas}>
        {/* El radar es una representación redundante: todo lo que muestra
            está también en la lista de al lado, que sí es operable por
            teclado. Por eso se oculta a los lectores de pantalla. */}
        <svg
          className={styles.svg}
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="holomap-sweep">
              <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" />
            </radialGradient>
            <filter id="holomap-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Anillos de referencia */}
          {[INNER_RADIUS, (INNER_RADIUS + OUTER_RADIUS) / 2, OUTER_RADIUS].map((r) => (
            <circle key={r} className={styles.ring} cx={CENTER} cy={CENTER} r={r} />
          ))}

          {/* Divisiones entre regiones */}
          {REGIONS.map((region, index) => {
            const p = polarToXY(sectorStartDeg(index), OUTER_RADIUS);
            return (
              <line
                key={region.slug}
                className={styles.divider}
                x1={CENTER}
                y1={CENTER}
                x2={p.x}
                y2={p.y}
              />
            );
          })}

          <path className={styles.backdrop} d={backdropPath} />

          <path
            className={styles.sweep}
            d={sweepPath}
            fill="url(#holomap-sweep)"
          />

          {/* Sectores interactivos: pulsar uno enfoca esa región */}
          {REGIONS.map((region, index) => {
            const start = sectorStartDeg(index);
            const active = map.activeRegion === index;
            return (
              <path
                key={region.slug}
                className={`${styles.sector} ${active ? styles.sectorActive : ''}`}
                d={wedgePath(start, start + SECTOR_SPAN_DEG, INNER_RADIUS, OUTER_RADIUS)}
                onClick={() => map.setActiveRegion(active ? null : index)}
              />
            );
          })}

          {/* Etiquetas de región */}
          {REGIONS.map((region, index) => {
            const mid = sectorStartDeg(index) + SECTOR_SPAN_DEG / 2;
            const p = polarToXY(mid, OUTER_RADIUS + 26);
            const cos = Math.cos((mid * Math.PI) / 180);
            const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
            const count = perRegion[index];

            return (
              <g key={region.slug}>
                <text
                  className={`${styles.regionLabel} ${
                    map.activeRegion === index || count > 0 ? styles.regionLabelActive : ''
                  }`}
                  x={p.x}
                  y={p.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                >
                  {region.label}
                </text>
                {count > 0 && (
                  <text
                    className={styles.regionCount}
                    x={p.x}
                    y={p.y + 14}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                  >
                    {count} zona{count === 1 ? '' : 's'}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodos de la región enfocada (modo exploración) */}
          {map.activeRegion !== null &&
            map.regionLocations.map((loc) => (
              <circle
                key={loc.name}
                className={styles.node}
                cx={loc.x}
                cy={loc.y}
                r={hot === loc.name ? 5 : 3}
                fill="var(--c-text-dim)"
                opacity={hot === loc.name ? 1 : 0.55}
                onClick={() => onOpenZone(loc.locationId)}
                onMouseEnter={() => setHot(loc.name)}
                onMouseLeave={() => setHot(null)}
              />
            ))}

          {/* Avistamientos del espécimen cargado */}
          {map.zones.map((zone) => {
            const isHot = hot === zone.locationName;
            const radius = 3.5 + (Math.min(100, zone.maxChance) / 100) * 4.5;
            return (
              <g
                key={zone.locationName}
                className={`${styles.node} ${isHot ? styles.nodeActive : ''}`}
                onClick={() => onOpenZone(zone.locationId)}
                onMouseEnter={() => setHot(zone.locationName)}
                onMouseLeave={() => setHot(null)}
              >
                <circle
                  className={styles.nodeHalo}
                  cx={zone.x}
                  cy={zone.y}
                  r={radius * 2.4}
                  fill="var(--c-accent)"
                  opacity={isHot ? 0.28 : 0.12}
                />
                <circle
                  className={styles.nodeCore}
                  cx={zone.x}
                  cy={zone.y}
                  r={isHot ? radius * 1.35 : radius}
                  fill="var(--c-accent)"
                  filter="url(#holomap-glow)"
                />
              </g>
            );
          })}

          <circle className={styles.centerRing} cx={CENTER} cy={CENTER} r={14} />
          <circle className={styles.center} cx={CENTER} cy={CENTER} r={3} />
        </svg>
      </div>

      {/* ── Panel lateral ─────────────────────────────────────────────── */}
      <div className={styles.side}>
        {showingDossier ? (
          <>
            <button type="button" className={styles.back} onClick={onCloseZone}>
              ← Volver al listado
            </button>

            {map.dossierStatus === 'loading' && (
              <p className={styles.note}>&gt;&gt; Leyendo censo de la zona…</p>
            )}
            {map.dossierStatus === 'error' && (
              <p className={styles.note}>
                &gt;&gt; {map.dossierError ?? 'No se pudo leer la zona'}
              </p>
            )}
            {map.dossier && (
              <ZoneDossier
                dossier={map.dossier}
                onClose={onCloseZone}
                onSelectPokemon={onSelectPokemon}
              />
            )}
          </>
        ) : (
          <>
            <header className={styles.sideHead}>
              <h2 className={styles.title}>
                {pokemonName ? 'Avistamientos' : 'Explorar regiones'}
              </h2>
              <span className={styles.meta}>
                {map.geoReady ? `${map.geoSize} localizaciones` : 'Cargando…'}
              </span>
            </header>

            {/* Modo espécimen */}
            {pokemonName && map.zonesStatus === 'loading' && (
              <p className={styles.note}>&gt;&gt; Triangulando avistamientos…</p>
            )}

            {pokemonName && map.zonesStatus === 'error' && (
              <p className={styles.note}>
                &gt;&gt; {map.zonesError ?? 'No se pudo trazar el mapa'}
              </p>
            )}

            {pokemonName && map.zonesStatus === 'ready' && !hasZones && (
              <p className={styles.note}>
                &gt;&gt; {pokemonName} no tiene avistamientos registrados en estado
                salvaje. Suele ocurrir con evoluciones, legendarios y formas
                especiales: se obtienen por otros medios.
              </p>
            )}

            {hasZones && (
              <div className={styles.list}>
                {map.zones.map((zone) => (
                  <button
                    key={zone.locationName}
                    type="button"
                    className={`${styles.zone} ${
                      hot === zone.locationName ? styles.zoneHot : ''
                    }`}
                    onClick={() => onOpenZone(zone.locationId)}
                    onMouseEnter={() => setHot(zone.locationName)}
                    onMouseLeave={() => setHot(null)}
                    onFocus={() => setHot(zone.locationName)}
                    onBlur={() => setHot(null)}
                  >
                    <span className={styles.zoneName}>{zone.label}</span>
                    <span className={styles.zoneRegion}>{zone.regionLabel}</span>
                    <span className={styles.zoneChance}>
                      {zone.maxChance > 0 ? `${zone.maxChance}%` : '—'}
                    </span>
                    <span className={styles.zoneDetails}>
                      {zone.details.slice(0, 3).map((detail) => (
                        <span key={detail.method + detail.minLevel} className={styles.chip}>
                          {detail.methodLabel} · Nv {detail.minLevel}
                          {detail.maxLevel !== detail.minLevel && `–${detail.maxLevel}`}
                        </span>
                      ))}
                      {zone.versions.length > 0 && (
                        <span className={styles.chip}>{zone.versions.length} ed.</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Modo exploración */}
            {!pokemonName && map.activeRegion === null && (
              <p className={styles.note}>
                &gt;&gt; Pulsa un sector del radar para recorrer sus localizaciones,
                o analiza un espécimen para ver dónde vive
              </p>
            )}

            {!pokemonName && map.activeRegion !== null && (
              <div className={styles.list}>
                {map.regionLocations.map((loc) => (
                  <button
                    key={loc.name}
                    type="button"
                    className={`${styles.zone} ${hot === loc.name ? styles.zoneHot : ''}`}
                    onClick={() => onOpenZone(loc.locationId)}
                    onMouseEnter={() => setHot(loc.name)}
                    onMouseLeave={() => setHot(null)}
                    onFocus={() => setHot(loc.name)}
                    onBlur={() => setHot(null)}
                  >
                    <span className={styles.zoneName}>{loc.label}</span>
                    <span className={styles.zoneRegion}>
                      {REGIONS[loc.regionIndex]?.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* `memo` evita que el mapa se vuelva a renderizar cuando el padre lo hace
   por motivos ajenos a él —por ejemplo, al teclear en el buscador—. Aquí sí
   compensa: el radar dibuja más de mil nodos SVG. */
export const HoloMap = memo(HoloMapImpl);
