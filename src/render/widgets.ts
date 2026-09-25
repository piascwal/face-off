import { texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';

export interface ZoneBouton {
  x: number;
  y: number;
  w: number;
  h: number;
  act: () => void;
}

export interface OptionsBouton {
  couleur?: string;
  clair?: string;
  fonce?: string;
  texte?: string;
  e?: number;
}

export function bouton(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  act: () => void,
  opts: OptionsBouton = {},
): void {
  const base = opts.couleur ?? '#1f2650';
  px(g, x - 1, y - 1, w + 2, h + 2, C.contour);
  px(g, x, y, w, h, base);
  px(g, x, y, w, 1, opts.clair ?? '#3a4590');
  px(g, x, y + h - 2, w, 2, opts.fonce ?? '#141939');
  const e = opts.e ?? 1;
  texte(g, label, x + w / 2, y + Math.round((h - 7 * e) / 2) - 1, opts.texte ?? C.blanc, e, 'c');
  boutons.push({ x, y, w, h, act });
}

export function panneau(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(7,9,20,0.78)';
  g.fillRect(x, y, w, h);
  px(g, x, y, w, 1, '#2a3160');
  px(g, x, y + h - 1, w, 1, '#2a3160');
  px(g, x, y, 1, h, '#2a3160');
  px(g, x + w - 1, y, 1, h, '#2a3160');
}

export function clicSurBouton(boutons: ZoneBouton[], px_: number, py: number): ZoneBouton | null {
  for (const b of boutons) {
    if (px_ >= b.x && px_ <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
