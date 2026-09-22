import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Nombre del repositorio: GitHub Pages sirve el sitio bajo esta subcarpeta. */
const REPO = 'base-pokedex-20262-alejandrocaycedo';

/**
 * Fallback de SPA para GitHub Pages.
 *
 * Pages es un servidor de archivos estáticos: no sabe reescribir rutas. Al
 * entrar directamente a /pokemon/pikachu busca ese archivo, no lo encuentra y
 * responde 404.
 *
 * El truco es que ante un 404 Pages sirve el contenido de `404.html` **sin
 * redirigir**, así que la barra de direcciones conserva la ruta original. Si
 * ese archivo es una copia de `index.html`, la aplicación arranca con la URL
 * correcta y React Router la resuelve con normalidad.
 *
 * Requiere que los assets se referencien con ruta absoluta, que es justo lo
 * que garantiza `base`.
 */
function githubPagesSpaFallback(): Plugin {
  let outDir = 'dist';

  return {
    name: 'gh-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const from = resolve(process.cwd(), outDir, 'index.html');
      const to = resolve(process.cwd(), outDir, '404.html');
      if (existsSync(from)) copyFileSync(from, to);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  /* En desarrollo el sitio va en la raíz; en producción cuelga del nombre del
     repositorio. `import.meta.env.BASE_URL` refleja este valor y es lo que se
     pasa como `basename` al Router en main.tsx. */
  base: mode === 'production' ? `/${REPO}/` : '/',
  plugins: [react(), githubPagesSpaFallback()],
}));
