/* ==========================================================================
   Motor de audio (ARCHITECTURE.md §ADR-05).

   Dos problemas distintos resueltos de forma distinta dentro de un único
   AudioContext:

   · Blip de teclado → SINTETIZADO. Un archivo, por pequeño que sea, implica
     red, decodificación y un primer disparo tardío. Un oscilador con
     envolvente cuesta microsegundos y cero bytes.

   · Grito del Pokémon → descargado, decodificado una vez y guardado como
     AudioBuffer en una LRU, de modo que repetirlo es instantáneo.

   Regla dura: `playKeyBlip` no puede lanzar ni devolver promesa. Está en el
   manejador `onChange` del input y no debe poder romper el tecleo.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LRU } from '../utils/lru';
import { KEYS, readJSON, writeJSON } from '../services/storage';
import type { PokemonCries } from '../types/pokemon';

/* ── Contrato público ────────────────────────────────────────────────────── */

export type BlipVariant = 'type' | 'delete';

export interface UseAudio {
  /** Síncrono y a prueba de fallos. Nunca lanza. */
  playKeyBlip: (variant?: BlipVariant) => void;
  playCry: (cries: PokemonCries) => Promise<void>;
  stopCry: () => void;
  muted: boolean;
  toggleMute: () => void;
  volume: number;
  setVolume: (value: number) => void;
  /** Crea o reanuda el AudioContext. Debe llamarse desde un gesto del usuario. */
  unlock: () => void;
  /** false si el navegador no soporta Web Audio: la UI oculta los controles. */
  supported: boolean;
}

/* ── Motor de bajo nivel, fuera de React ─────────────────────────────────── */

interface Engine {
  ctx: AudioContext;
  /** Volumen general; el interruptor de silencio actúa aquí. */
  master: GainNode;
  /** Rama de los gritos, atenuada respecto al blip para no sobresaltar. */
  cryBus: GainNode;
  noise: AudioBuffer;
}

type AudioContextCtor = typeof AudioContext;

let engine: Engine | null = null;
let unsupported = false;

/** Ruido blanco corto, generado una vez y reutilizado en cada clic de tecla. */
function buildNoise(ctx: AudioContext): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * 0.02);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Crea el AudioContext de forma perezosa.
 *
 * Nunca al montar: la política de autoplay dejaría el contexto en estado
 * `suspended` y el primer blip se perdería en silencio. Se construye con el
 * primer gesto real del usuario.
 */
function ensureEngine(): Engine | null {
  if (engine) return engine;
  if (unsupported) return null;

  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

  if (!Ctor) {
    unsupported = true;
    return null;
  }

  try {
    const ctx = new Ctor();

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    const cryBus = ctx.createGain();
    cryBus.gain.value = 0.55;
    cryBus.connect(master);

    engine = { ctx, master, cryBus, noise: buildNoise(ctx) };
    return engine;
  } catch {
    unsupported = true;
    return null;
  }
}

/* ── Síntesis del blip ───────────────────────────────────────────────────── */

const BLIP_MIN_GAP_MS = 35; // un usuario a 15 p/s oye cadencia, no saturación
let lastBlipAt = 0;

function synthBlip(e: Engine, variant: BlipVariant, level: number): void {
  const { ctx, master } = e;
  const t = ctx.currentTime;

  const isDelete = variant === 'delete';
  const base = isDelete ? 340 : 720;
  /* Variación de tono en cada pulsación: sin ella, 40 blips idénticos
     seguidos producen fatiga auditiva casi inmediata (PRD FR-05). */
  const freq = base * (0.9 + Math.random() * 0.2);
  const dur = isDelete ? 0.05 : 0.032;
  const peak = level * (isDelete ? 0.05 : 0.06);

  /* Tono: cuadrada con caída de frecuencia — el "blip" cibernético. */
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);

  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, t);
  toneGain.gain.exponentialRampToValueAtTime(peak, t + 0.001); // ataque 1 ms
  toneGain.gain.exponentialRampToValueAtTime(0.0001, t + dur); // caída exponencial

  osc.connect(toneGain);
  toneGain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.01);

  /* Transitorio: ruido en paso alto. Es lo que da la sensación mecánica;
     sin él el blip suena a videojuego, no a teclado. */
  const click = ctx.createBufferSource();
  click.buffer = e.noise;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2400;

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(level * 0.035, t);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);

  click.connect(hp);
  hp.connect(clickGain);
  clickGain.connect(master);
  click.start(t);
  click.stop(t + 0.02);
}

/* ── Gritos ──────────────────────────────────────────────────────────────── */

const cryCache = new LRU<string, AudioBuffer>(30);
/** URLs que ya fallaron: no se reintentan en toda la sesión. */
const cryFailures = new Set<string>();

let currentCry: AudioBufferSourceNode | null = null;

async function loadCry(e: Engine, url: string): Promise<AudioBuffer | null> {
  const cached = cryCache.get(url);
  if (cached) return cached;
  if (cryFailures.has(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));

    const bytes = await response.arrayBuffer();
    /* `decodeAudioData` puede rechazar Ogg Vorbis en Safari antiguo. Ese es
       el fallo que esta función está diseñada para absorber. */
    const buffer = await e.ctx.decodeAudioData(bytes);
    cryCache.set(url, buffer);
    return buffer;
  } catch {
    cryFailures.add(url);
    return null;
  }
}

/* ── Contexto de React ───────────────────────────────────────────────────── */

const AudioCtx = createContext<UseAudio | null>(null);
export const AudioContextProvider = AudioCtx.Provider;

interface StoredPrefs {
  muted: boolean;
  volume: number;
}

/**
 * Construye el valor del contexto. Lo llama AudioProvider una sola vez en
 * toda la aplicación; los componentes consumen con `useAudio()`.
 */
export function useAudioEngine(): UseAudio {
  const prefs = useMemo(
    () => readJSON<StoredPrefs>(KEYS.audio) ?? { muted: false, volume: 0.8 },
    [],
  );

  const [muted, setMuted] = useState(prefs.muted);
  const [volume, setVolumeState] = useState(prefs.volume);
  const [supported, setSupported] = useState(true);

  /* Los manejadores de audio se llaman desde eventos de teclado a alta
     frecuencia. Leer de refs evita recrear las funciones en cada render y,
     con ello, re-suscribir manejadores en los componentes hijos. */
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);

  /* La sincronización ocurre tras el commit, no durante el render. Los
     manejadores que leen estas refs solo se ejecutan por interacción del
     usuario, que siempre sucede después. */
  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    writeJSON(KEYS.audio, { muted, volume } satisfies StoredPrefs);
  }, [muted, volume]);

  const unlock = useCallback(() => {
    const e = ensureEngine();
    if (!e) {
      setSupported(false);
      return;
    }
    // Tras un gesto del usuario el contexto puede seguir suspendido.
    if (e.ctx.state === 'suspended') void e.ctx.resume();
  }, []);

  const playKeyBlip = useCallback((variant: BlipVariant = 'type') => {
    if (mutedRef.current) return; // silenciado: no se crea ni un nodo

    const now = performance.now();
    if (now - lastBlipAt < BLIP_MIN_GAP_MS) return;
    lastBlipAt = now;

    try {
      const e = ensureEngine();
      if (!e) return;
      if (e.ctx.state === 'suspended') void e.ctx.resume();
      synthBlip(e, variant, volumeRef.current);
    } catch {
      /* El audio jamás puede interrumpir el tecleo. */
    }
  }, []);

  const stopCry = useCallback(() => {
    if (!currentCry) return;
    try {
      currentCry.stop();
    } catch {
      /* ya había terminado */
    }
    currentCry = null;
  }, []);

  const playCry = useCallback(
    async (cries: PokemonCries) => {
      if (mutedRef.current) return;

      const e = ensureEngine();
      if (!e) return;
      if (e.ctx.state === 'suspended') await e.ctx.resume();

      /* `latest` es el grito de los juegos modernos; `legacy` el de las
         primeras generaciones. Se intenta el primero y se cae al segundo. */
      const candidates = [cries.latest, cries.legacy].filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
      );

      for (const url of candidates) {
        const buffer = await loadCry(e, url);
        if (!buffer) continue;

        stopCry(); // nunca dos gritos solapados (PRD FR-06)

        const source = e.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(e.cryBus);
        source.onended = () => {
          if (currentCry === source) currentCry = null;
        };
        source.start();
        currentCry = source;
        return;
      }
      /* Ningún candidato se pudo decodificar: se continúa en silencio, sin
         mostrar error. Un navegador que no suena no rompe la búsqueda. */
    },
    [stopCry],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        // Silenciar debe cortar también el grito que esté sonando.
        if (currentCry) {
          try {
            currentCry.stop();
          } catch {
            /* ya terminó */
          }
          currentCry = null;
        }
      }
      return next;
    });
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(1, Math.max(0, value)));
  }, []);

  /* El volumen se aplica al nodo maestro además de a la síntesis, para que
     un grito ya en curso también obedezca al cambio. */
  useEffect(() => {
    if (!engine) return;
    engine.master.gain.value = muted ? 0 : volume;
  }, [muted, volume]);

  return useMemo(
    () => ({
      playKeyBlip,
      playCry,
      stopCry,
      muted,
      toggleMute,
      volume,
      setVolume,
      unlock,
      supported,
    }),
    [playKeyBlip, playCry, stopCry, muted, toggleMute, volume, setVolume, unlock, supported],
  );
}

/** Hook que consumen los componentes. */
export function useAudio(): UseAudio {
  const value = useContext(AudioCtx);
  if (!value) throw new Error('useAudio debe usarse dentro de <AudioProvider>');
  return value;
}
