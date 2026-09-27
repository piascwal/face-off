import type { Banniere } from './effects';
import type { BanqueSprites } from './sprites';

/**
 * Réglages de la célébration du buteur sur l'écran de but — à ajuster en
 * jouant. La traversée doit tenir dans la célébration en direct : avec le
 * ralenti des buts, celle-ci dure au moins `retard + duree` (voir
 * `CELEBRATION_S` dans app/ralenti.ts) ; sans ralenti, le bandeau reste 2,4 s.
 */
export const CELEBRATION = {
  /** Temps entre le but et l'entrée du joueur à gauche (s). */
  retard: 0.05,
  /** Traversée complète, de l'entrée à gauche à la sortie à droite (s). */
  duree: 1.5,
  /**
   * Ralentissement au centre de l'écran : 0 = vitesse constante ; 0,6 = le
   * joueur passe au centre à 40 % de sa vitesse moyenne (et entre/sort plus vite).
   */
  ralentiCentre: 0.6,
  /**
   * Hauteur du joueur, en part de la hauteur de l'écran, mesurée sur le
   * premier dessin ; les autres gardent la même échelle (à genou : plus petit).
   */
  hauteur: 0.42,
};

/** Pseudo-hasard stable (0..1) : la gerbe de glace est la même d'une image à l'autre. */
function hasard(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Le buteur (dessin tiré au sort, aux couleurs de son équipe) traverse le bas
 * de l'écran de gauche à droite pendant la célébration, devant l'écusson
 * géant et sous le bandeau « BUT ! ».
 */
export function dessineCelebration(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  sprites: BanqueSprites,
  banniere: Banniere | null,
  ecranUI: string,
): void {
  const c = banniere?.celebration;
  if (!c || ecranUI === 'menu') return;
  const sprite = sprites.spriteCelebration(c.spriteId, c.tirage);
  if (!sprite) return;
  const { retard, duree, ralentiCentre, hauteur } = CELEBRATION;
  const t = banniere.max - banniere.vie - retard;
  if (t < 0 || t > duree) return;
  const M = sprites.meta.celebration;
  const k = (H * hauteur) / M.reference;
  const h = M.tileH * k;
  const w = M.tileW * k;
  // position le long de la traversée, plus lente au centre
  const pos = (u: number) => u + (ralentiCentre * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
  const u = t / duree;
  const x = -w + (W + w) * pos(u);
  const sol = H - 3;
  const y = sol - h;
  const pied = x + w * 0.47;

  // ombre sous le patin d'appui
  g.globalAlpha = 0.35;
  g.fillStyle = '#0a1428';
  g.beginPath();
  g.ellipse(Math.round(pied), sol - 1, w * 0.3, 3, 0, 0, Math.PI * 2);
  g.fill();

  // gerbe de glace : des éclats lâchés derrière le patin, qui retombent
  g.fillStyle = '#ebf8ff';
  const pas = 0.025;
  for (let i = 0; i < 18; i++) {
    const age = i * pas + (t % pas);
    const te = t - age;
    if (te < 0) break;
    const n = Math.floor(te / pas);
    const x0 = -w + (W + w) * pos(te / duree) + w * 0.47 - 4;
    const vx = -40 - 110 * hasard(n);
    const vy = -25 - 70 * hasard(n + 0.5);
    const px = x0 + vx * age;
    const py = sol - 2 + vy * age + 130 * age * age;
    if (py > sol) continue;
    g.globalAlpha = Math.max(0, 1 - age / (18 * pas));
    g.fillRect(Math.round(px), Math.round(py), 2, 2);
  }
  g.globalAlpha = 1;

  const { img, rect: r } = sprite;
  const lisse = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, r.sx, r.sy, r.sw, r.sh, Math.round(x), Math.round(y), w, h);
  g.imageSmoothingEnabled = lisse;
}
