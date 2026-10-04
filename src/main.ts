import { GameApp } from '@app/game-app';
import { INTERVALLE_RECHERCHE_MS, lisVersionPubliee } from '@app/mise-a-jour';

const canvas = document.getElementById('ecran') as HTMLCanvasElement;
const app = new GameApp(canvas);
void app.demarre();
// outil de test de bout en bout (jamais présent dans la version publiée)
if (import.meta.env.DEV) (window as unknown as { faceOff: GameApp }).faceOff = app;

if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      // « prompt » : la nouvelle version est téléchargée mais pas installée sans l'accord du joueur
      const installe = registerSW({
        immediate: true,
        onNeedRefresh: () =>
          void lisVersionPubliee(import.meta.env.BASE_URL).then((v) =>
            app.maj.signale(() => void installe(true), v),
          ),
        onRegisteredSW: (_url, reg) => {
          if (!reg) return;
          // hors ligne ou serveur injoignable : on ne dit rien, le jeu reste jouable
          const cherche = () => {
            if (navigator.onLine) reg.update().catch(() => {});
          };
          setInterval(cherche, INTERVALLE_RECHERCHE_MS);
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) cherche();
          });
        },
      });
    })
    .catch(() => {
      /* pas de PWA en dev, ou plugin indisponible : tant pis */
    });
}
