import type { TeamId } from '@core/types';

/**
 * Charge les feuilles de sprites PNG pixel art générées hors-ligne par
 * `scripts/generate-sprites.mjs` (voir ce script pour le détail du rendu :
 * plus de nuances que le POC, chandails à numéro, visière, lame qui brille...).
 *
 * Une vraie infographiste pourra plus tard remplacer directement les PNG dans
 * `public/sprites/` (même grille, mêmes dimensions dans `meta.json`) sans
 * toucher au code : c'est tout l'intérêt de sortir ces assets du JS.
 */

interface Meta {
  tileW: number;
  tileH: number;
  skaterFrames: number;
}

export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export class BanqueSprites {
  private meta: Meta = { tileW: 22, tileH: 30, skaterFrames: 3 };
  private skater: [HTMLImageElement, HTMLImageElement] | null = null;
  private goalie: [HTMLImageElement, HTMLImageElement] | null = null;
  pret = false;

  async charge(base = `${import.meta.env.BASE_URL}sprites`): Promise<void> {
    const chargeImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const [meta, s0, s1, g0, g1] = await Promise.all([
      fetch(`${base}/meta.json`).then((r) => r.json() as Promise<Meta>),
      chargeImage(`${base}/skater-0.png`),
      chargeImage(`${base}/skater-1.png`),
      chargeImage(`${base}/goalie-0.png`),
      chargeImage(`${base}/goalie-1.png`),
    ]);
    this.meta = meta;
    this.skater = [s0, s1];
    this.goalie = [g0, g1];
    this.pret = true;
  }

  get tailleJoueur(): { w: number; h: number } {
    return { w: this.meta.tileW, h: this.meta.tileH };
  }

  spriteJoueur(eq: TeamId, frame: number, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    if (!this.skater) return null;
    const { tileW, tileH, skaterFrames } = this.meta;
    const col = Math.max(0, Math.min(skaterFrames - 1, frame));
    const row = gauche ? 1 : 0;
    return { img: this.skater[eq], rect: { sx: col * tileW, sy: row * tileH, sw: tileW, sh: tileH } };
  }

  spriteGardien(eq: TeamId, gauche: boolean): { img: HTMLImageElement; rect: Rect } | null {
    if (!this.goalie) return null;
    const { tileW, tileH } = this.meta;
    const row = gauche ? 1 : 0;
    return { img: this.goalie[eq], rect: { sx: 0, sy: row * tileH, sw: tileW, sh: tileH } };
  }
}
