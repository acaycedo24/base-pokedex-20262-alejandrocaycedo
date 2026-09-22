import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AudioContextProvider, useAudioEngine } from '../hooks/useAudio';

interface Props {
  children: ReactNode;
}

/**
 * Único punto donde se instancia el motor de audio.
 *
 * Además registra el "desbloqueo" del AudioContext: los navegadores solo
 * permiten crear y arrancar audio dentro de un gesto real del usuario, así
 * que se escucha el primero que ocurra —tecla, puntero o toque— y se
 * desregistra inmediatamente.
 */
export function AudioProvider({ children }: Props) {
  const audio = useAudioEngine();
  const { unlock } = audio;

  useEffect(() => {
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];

    const onFirstGesture = () => {
      unlock();
      for (const event of events) window.removeEventListener(event, onFirstGesture);
    };

    for (const event of events) {
      window.addEventListener(event, onFirstGesture, { once: true, passive: true });
    }

    return () => {
      for (const event of events) window.removeEventListener(event, onFirstGesture);
    };
  }, [unlock]);

  return <AudioContextProvider value={audio}>{children}</AudioContextProvider>;
}
