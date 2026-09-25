import type { Rink } from './types';
import { clamp } from './utils';

/**
 * Calcule la géométrie de la patinoire à partir de la taille logique de
 * l'écran (mode paysage). Pure fonction de W/H — c'est ce que l'app cliente
 * appelle au redimensionnement, et ce qu'un futur serveur pourrait aussi
 * appeler pour rejouer la même disposition côté simulation.
 */
export function calculeRink(W: number, H: number): Rink {
  const haut = 25;
  const marge = 5;
  const h = Math.max(120, H - haut - marge);
  const w = Math.max(240, Math.min(W - 14, Math.round(h * 2.25)));
  const x = Math.round((W - w) / 2);
  const y = haut;
  const r = Math.round(h * 0.24);
  const cx = x + w / 2;
  const cy = y + Math.round(h / 2);
  const recul = Math.round(Math.max(26, w * 0.075));
  const butG = x + recul;
  const butD = x + w - recul;
  const bleueG = Math.round(x + w * 0.35);
  const bleueD = Math.round(x + w * 0.65);
  return { x, y, w, h, r, cx, cy, butG, butD, bleueG, bleueD };
}

/** Distance signée au bord intérieur des bandes (négative sur la glace). */
export function distBande(rink: Rink, x: number, y: number): number {
  const ix0 = rink.x + rink.r;
  const ix1 = rink.x + rink.w - rink.r;
  const iy0 = rink.y + rink.r;
  const iy1 = rink.y + rink.h - rink.r;
  const qx = clamp(x, ix0, ix1);
  const qy = clamp(y, iy0, iy1);
  return Math.hypot(x - qx, y - qy) - rink.r;
}

/** Remet à l'échelle une position d'un ancien tracé vers un nouveau (au resize). */
export function reprojette(ancien: Rink, nouveau: Rink, o: { x: number; y: number }): void {
  o.x = nouveau.x + ((o.x - ancien.x) * nouveau.w) / ancien.w;
  o.y = nouveau.y + ((o.y - ancien.y) * nouveau.h) / ancien.h;
}
