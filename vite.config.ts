import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { ORIGINES_COURTIERS } from './src/net/courtiers.ts';

// Déployé sur GitHub Pages en tant que site de projet
// (https://piascwal.github.io/face-off/) : tout doit être résolu sous ce
// sous-chemin, pas à la racine du domaine. En dev, on reste à la racine pour
// que `npm run dev` reste simple.
const BASE = process.env.NODE_ENV === 'production' ? '/face-off/' : '/';

// Numéro affiché sur l'écran d'accueil : la version de package.json, suivie du
// numéro de build GitHub Actions (+14...) pour savoir d'un coup d'œil si un
// téléphone a bien reçu la dernière mise en ligne.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const VERSION_APP = `V${version}${process.env.GITHUB_RUN_NUMBER ? `+${process.env.GITHUB_RUN_NUMBER}` : ''}`;

/**
 * Politique de sécurité du contenu, posée sur la page publiée (pas en
 * développement : le serveur Vite injecte ses propres scripts) : rien d'autre
 * que les fichiers du jeu, et des connexions vers les seuls serveurs de
 * découverte. WebRTC (le jeu en réseau local) n'est pas concerné par
 * `connect-src`. Défense en profondeur : même un bug d'affichage ne pourrait
 * ni charger un script étranger, ni envoyer des données ailleurs.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  `connect-src 'self' ${ORIGINES_COURTIERS.map((u) => new URL(u).origin).join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base: BASE,
  define: {
    __VERSION_APP__: JSON.stringify(VERSION_APP),
  },
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
    {
      // la version publiée, lisible sans cache : sert à dire laquelle est proposée
      name: 'face-off-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION_APP }) });
      },
    },
    {
      name: 'face-off-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
    VitePWA({
      // « prompt » : on propose la mise à jour au joueur au lieu de recharger la page de force (voir app/mise-a-jour.ts)
      registerType: 'prompt',
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
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,webmanifest}'],
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
