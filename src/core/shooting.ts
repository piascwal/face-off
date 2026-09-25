import { BUT_DEMI } from './constants';
import type { Goalie, Rink, TeamId } from './types';
import { angDiff, clamp } from './utils';

export const butAttaque = (rink: Rink, eq: TeamId): number => (eq === 0 ? rink.butD : rink.butG);
export const butDefendu = (rink: Rink, eq: TeamId): number => (eq === 0 ? rink.butG : rink.butD);
export const sensAttaque = (eq: TeamId): number => (eq === 0 ? 1 : -1);

/** Vise le coin de la cage le plus éloigné de la position actuelle du gardien. */
export function angleVersCoinLoin(
  rink: Rink,
  eq: TeamId,
  x: number,
  y: number,
  gardien: Goalie,
  err = 0,
): number {
  const gx = butAttaque(rink, eq);
  const dir = sensAttaque(eq);
  const aGk = Math.atan2(gardien.y - y, gardien.x - x);
  let meilleur = 0;
  let ecart = -1;
  for (const sy of [-1, 1]) {
    const a = Math.atan2(rink.cy + sy * (BUT_DEMI - 3.5) - y, gx - dir * 1 - x);
    const e = Math.abs(angDiff(a, aGk));
    if (e > ecart) {
      ecart = e;
      meilleur = a;
    }
  }
  return meilleur + (Math.random() + Math.random() - 1) * err;
}

/**
 * Qualité du placement (0..1) : 0 si le tir part hors du cadre, sinon la
 * distance normalisée entre le point d'impact visé sur la ligne de but et la
 * position du gardien à l'instant du tir. Un tir dans la lucarne opposée au
 * gardien vaut 1, un tir droit sur lui vaut 0.
 */
export function qualiteDirection(rink: Rink, eq: TeamId, x: number, y: number, ang: number, gardien: Goalie): number {
  const gx = butAttaque(rink, eq);
  const dir = sensAttaque(eq);
  const vx = Math.cos(ang);
  const vy = Math.sin(ang);
  if (vx * dir <= 0.001) return 0;
  const t = (gx - x) / vx;
  if (t <= 0) return 0;
  const yAuBut = y + vy * t;
  if (Math.abs(yAuBut - rink.cy) > BUT_DEMI + 1) return 0;
  const yCadre = clamp(yAuBut, rink.cy - BUT_DEMI, rink.cy + BUT_DEMI);
  return clamp(Math.abs(yCadre - gardien.y) / BUT_DEMI, 0, 1);
}

/**
 * Qualité globale d'un tir (0..0.92) : combine puissance et précision du
 * placement. C'est cette valeur qui augmente la probabilité de but — voir
 * `rayonGardienEffectif` / `seuilRattrapeEffectif` dans physics.ts, qui
 * l'utilisent pour rendre le gardien statistiquement moins efficace face à un
 * tir puissant et bien placé, sans jamais le rendre infranchissable ni
 * garanti imparable (plafond à 0.92).
 */
export function qualiteDuTir(
  rink: Rink,
  eq: TeamId,
  x: number,
  y: number,
  ang: number,
  puissance: number,
  gardien: Goalie,
): number {
  const dirQ = qualiteDirection(rink, eq, x, y, ang, gardien);
  if (dirQ <= 0) return 0;
  const puissanceQ = clamp(puissance, 0, 1);
  return clamp(puissanceQ * 0.55 + dirQ * 0.55 - 0.1, 0, 0.92);
}

/** Rayon de blocage du gardien, réduit par la qualité du tir en cours. */
export function rayonGardienEffectif(gardien: Goalie, qualite: number): number {
  return gardien.r * (1 - 0.4 * clamp(qualite, 0, 1));
}

/** Vitesse en-dessous de laquelle le gardien capte proprement le palet. */
export function seuilRattrapeEffectif(qualite: number): number {
  return 115 * (1 - 0.5 * clamp(qualite, 0, 1));
}
