import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Déployé sur GitHub Pages en tant que site de projet
// (https://piascwal.github.io/face-off/) : tout doit être résolu sous ce
// sous-chemin, pas à la racine du domaine. En dev, on reste à la racine pour
// que `npm run dev` reste simple.
const BASE = process.env.NODE_ENV === 'production' ? '/face-off/' : '/';

export default defineConfig({
  base: BASE,
  resolve: {
    alias: {
      '@core': '/src/core',
      '@render': '/src/render',
      '@audio': '/src/audio',
      '@input': '/src/input',
      '@app': '/src/app',
      '@net': '/src/net',
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'sprites/*.png', 'sprites/*.json'],
      manifest: {
        id: BASE,
        name: 'Face-Off — Hockey Arcade',
        short_name: 'Face-Off',
        description: 'Hockey arcade en pixel art, jouable en mode paysage.',
        // "fullscreen" masque la barre d'adresse une fois l'app installée ; les
        // navigateurs qui ne le supportent pas retombent sur "standalone".
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        start_url: BASE,
        scope: BASE,
        background_color: '#070914',
        theme_color: '#070914',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
