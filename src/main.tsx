import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import App from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el nodo #root en index.html');

createRoot(container).render(
  <StrictMode>
    {/* BrowserRouter usa la History API del navegador: cambiar de vista
        reescribe la URL sin pedir una página nueva al servidor.

        `basename` vale '/' en desarrollo y '/<repo>/' en GitHub Pages, donde
        el sitio no cuelga de la raíz del dominio. Vite rellena BASE_URL con
        lo que se configura en vite.config.ts, así que ambos nunca se
        desincronizan. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
