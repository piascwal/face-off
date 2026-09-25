import { GameApp } from '@app/game-app';

const canvas = document.getElementById('ecran') as HTMLCanvasElement;
const app = new GameApp(canvas);
void app.demarre();

if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      /* pas de PWA en dev, ou plugin indisponible : tant pis */
    });
}
