import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AudioProvider } from './context/AudioProvider';
import { RecentProvider } from './context/RecentProvider';
import { BootSequence } from './components/BootSequence/BootSequence';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { HoloBackground } from './components/HoloBackground/HoloBackground';
import { Layout } from './components/Layout/Layout';
import { HomePage } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SpecimenPage } from './pages/SpecimenPage';
import { KEYS, readJSON, writeJSON } from './services/storage';

/**
 * Raíz de la aplicación.
 *
 * Orden de las capas, de fuera adentro:
 *   ErrorBoundary  → un fallo de render no deja la pantalla en blanco
 *   AudioProvider  → un único AudioContext para toda la app
 *   RecentProvider → un único historial, compartido entre buscador y páginas
 *   Routes         → mapea cada URL a su componente
 *
 * HoloBackground y BootSequence quedan fuera de <Routes> a propósito: no
 * pertenecen a ninguna ruta, así que no deben remontarse al navegar.
 */
function App() {
  const [booting, setBooting] = useState(true);
  /* Se lee una sola vez al montar: en la segunda visita la secuencia de
     arranque se muestra abreviada (PRD, riesgo de producto §9). */
  const [shortBoot] = useState(() => readJSON<boolean>(KEYS.booted) === true);

  const handleBootDone = () => {
    writeJSON(KEYS.booted, true);
    setBooting(false);
  };

  return (
    <ErrorBoundary>
      <AudioProvider>
        <RecentProvider>
          <HoloBackground />
          {booting && <BootSequence onDone={handleBootDone} short={shortBoot} />}

          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/mapa" element={<MapPage />} />
              <Route path="/pokemon/:name" element={<SpecimenPage />} />
              <Route path="/pokemon/:name/mapa" element={<MapPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </RecentProvider>
      </AudioProvider>
    </ErrorBoundary>
  );
}

export default App;
