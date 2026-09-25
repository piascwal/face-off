import { qualiteDuTir } from './shooting';
import { equipe } from './state-helpers';
import type { Goalie, MatchState, Porteur, Rink, Skater, TeamId } from './types';
import { estPatineur } from './types';
import { angDiff, clamp, pointSegDist } from './utils';

export const pointCrosse = (s: Skater): { x: number; y: number } => ({
  x: s.x + Math.cos(s.face) * 8,
  y: s.y + Math.sin(s.face) * 8 + 1,
});

/** Le joueur humain ne pilote qu'un seul patineur à la fois. */
export function controle(state: MatchState, s: Skater): void {
  if (state.mode !== 'match' || s.eq !== 0 || state.controle === s) return;
  if (state.controle) {
    const a = state.controle;
    a.humain = false;
    a.arme = false;
    a.charge = 0;
    a.vise = null;
    a.ia.t = 0;
  }
  s.humain = true;
  s.arme = false;
  s.charge = 0;
  state.controle = s;
}

export function prendPalet(state: MatchState, qui: Porteur): void {
  const p = state.palet;
  p.porteur = qui;
  p.dernier = qui;
  p.passe = null;
  p.qualite = 0;
  if (estPatineur(qui)) {
    qui.tient = true;
    state.evenements.push({ type: 'touche' });
    controle(state, qui);
  }
}

export function lachePalet(state: MatchState, s: Skater, cd: number): void {
  const p = state.palet;
  if (p.porteur === s) p.porteur = null;
  s.tient = false;
  s.arme = false;
  s.charge = 0;
  s.recupCd = cd;
}

export function tir(state: MatchState, rink: Rink, s: Skater, ang: number, puissance: number): void {
  const p = state.palet;
  const v = 150 + 290 * puissance;
  lachePalet(state, s, 0.3);
  const sp = pointCrosse(s);
  p.x = sp.x;
  p.y = sp.y;
  p.vx = Math.cos(ang) * v + s.vx * 0.1;
  p.vy = Math.sin(ang) * v + s.vy * 0.1;
  p.tireur = s.eq;
  p.dernier = s;
  p.passe = null;
  p.qualite = qualiteDuTir(rink, s.eq, sp.x, sp.y, ang, puissance, state.gardiens[1 - s.eq] as Goalie);
  state.evenements.push({ type: 'frappe', puissance });
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 3 + Math.round(puissance * 8) });
  if (puissance > 0.7) state.evenements.push({ type: 'secousse', force: 1.5 });
}

/** Une ligne de passe est libre si aucun adversaire ne traîne dessus. */
export function ligneLibre(state: MatchState, eq: TeamId, x0: number, y0: number, x1: number, y1: number): boolean {
  for (const o of state.patineurs) {
    if (o.eq !== eq && pointSegDist(o.x, o.y, x0, y0, x1, y1) < 7) return false;
  }
  return true;
}

/**
 * Choisit le meilleur receveur. Avec une direction préférée (le joystick), on
 * ne regarde que les coéquipiers à peu près dans cette direction.
 */
export function meilleurReceveur(
  state: MatchState,
  s: Skater | null,
  eq: TeamId,
  x: number,
  y: number,
  angPref: number | null,
): { m: Skater; sc: number } | null {
  let best: Skater | null = null;
  let bs = -1e9;
  for (const m of state.patineurs) {
    if (m.eq !== eq || m === s || m.sonne > 0) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 14) continue;
    let sc = 0;
    if (angPref !== null) {
      const e = Math.abs(angDiff(angPref, Math.atan2(dy, dx)));
      if (e > 1.1) continue;
      sc -= e * 120;
    }
    sc += ligneLibre(state, eq, x, y, m.x, m.y) ? 40 : -40;
    sc += (m.x - x) * (eq === 0 ? 1 : -1) * 0.3;
    sc -= Math.abs(d - 70) * 0.2;
    for (const o of state.patineurs) if (o.eq !== eq && Math.hypot(o.x - m.x, o.y - m.y) < 16) sc -= 25;
    if (sc > bs) {
      bs = sc;
      best = m;
    }
  }
  return best ? { m: best, sc: bs } : null;
}

/** Envoie le palet vers un coéquipier, en visant là où il sera. */
export function lancePasse(state: MatchState, x: number, y: number, m: Skater, err: number): void {
  const p = state.palet;
  const d = Math.hypot(m.x - x, m.y - y);
  const v = clamp(150 + d * 0.9, 170, 310);
  const t = d / v;
  const tx = m.x + m.vx * t * 0.9;
  const ty = m.y + m.vy * t * 0.9;
  const a = Math.atan2(ty - y, tx - x) + (Math.random() + Math.random() - 1) * err;
  p.x = x;
  p.y = y;
  p.vx = Math.cos(a) * v;
  p.vy = Math.sin(a) * v;
  p.passe = { vers: m, t: 1.3 };
  p.tireur = null;
  p.qualite = 0;
  state.evenements.push({ type: 'frappe', puissance: 0.25 });
  controle(state, m);
}

export function passeVers(state: MatchState, s: Skater, m: Skater, err = 0.03): void {
  lachePalet(state, s, 0.3);
  const sp = pointCrosse(s);
  state.palet.dernier = s;
  lancePasse(state, sp.x, sp.y, m, err);
}

export function passeJoueur(state: MatchState, s: Skater, ix: number, iy: number): boolean {
  const pref = Math.hypot(ix, iy) > 0.3 ? Math.atan2(iy, ix) : null;
  const r = meilleurReceveur(state, s, s.eq, s.x, s.y, pref) ?? (pref !== null ? meilleurReceveur(state, s, s.eq, s.x, s.y, null) : null);
  if (!r) return false;
  passeVers(state, s, r.m, 0.02);
  return true;
}

/** Sans le palet, le bouton passe donne la main au coéquipier le plus proche du palet. */
export function changeJoueur(state: MatchState): void {
  const p = state.palet;
  let best: Skater | null = null;
  let dmin = 1e9;
  for (const m of equipe(state, 0)) {
    if (m === state.controle) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < dmin) {
      dmin = d;
      best = m;
    }
  }
  if (best) {
    controle(state, best);
    state.evenements.push({ type: 'clic' });
  }
}

export function elan(state: MatchState, s: Skater, dirx: number, diry: number): void {
  if (s.elanCd > 0 || s.sonne > 0) return;
  const m = Math.hypot(dirx, diry);
  let a = s.face;
  if (m > 0.2) a = Math.atan2(diry, dirx);
  const boost = s.tient ? 85 : 150;
  s.vx += Math.cos(a) * boost;
  s.vy += Math.sin(a) * boost;
  s.face = a;
  s.elanT = 0.3;
  s.elanCd = s.tient ? 1.4 : 1.0;
  state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 6, vx: -s.vx, vy: -s.vy });
  state.evenements.push({ type: 'elan' });
}
