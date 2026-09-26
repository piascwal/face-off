import { CHANGEMENT_AUTO_MARGE, CHANGEMENT_AUTO_SEUIL, COMBO_SEUIL } from './constants';
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
  const passeReussie = estPatineur(qui) && p.passe?.vers === qui;
  const equipePrecedente = p.dernier?.eq;
  p.porteur = qui;
  p.dernier = qui;
  p.passe = null;
  p.qualite = 0;
  // le palet change de camp : la séquence de passes de l'équipe qui le perd s'arrête là
  if (equipePrecedente !== undefined && equipePrecedente !== qui.eq) {
    state.combo[equipePrecedente] = 0;
    state.tirSpecialPret[equipePrecedente] = false;
  }
  if (estPatineur(qui)) {
    qui.tient = true;
    state.evenements.push({ type: 'touche' });
    controle(state, qui);
    if (passeReussie) {
      const n = ++state.combo[qui.eq];
      if (n >= COMBO_SEUIL) {
        if (!state.tirSpecialPret[qui.eq]) {
          state.evenements.push({ type: 'bulle', txt: 'TIR SPECIAL !', x: qui.x, y: qui.y - 20, c: '#ff8a3d' });
          state.evenements.push({ type: 'clic' });
        }
        state.tirSpecialPret[qui.eq] = true;
      } else if (n >= 2) {
        state.evenements.push({ type: 'bulle', txt: `COMBO x${n}`, x: qui.x, y: qui.y - 16, c: '#ffd35c' });
      }
    }
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
  // un tir consomme la combo de passes en cours, qu'il soit spécial ou non
  const special = state.tirSpecialPret[s.eq];
  state.combo[s.eq] = 0;
  state.tirSpecialPret[s.eq] = false;
  const v = (150 + 290 * puissance) * (special ? 1.25 : 1);
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
  if (special) p.qualite = Math.min(0.97, p.qualite + 0.2);
  state.evenements.push({ type: 'frappe', puissance });
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 3 + Math.round(puissance * 8), c: special ? '#ff8a3d' : undefined });
  if (puissance > 0.7 || special) state.evenements.push({ type: 'secousse', force: special ? 2.5 : 1.5 });
  if (special) state.evenements.push({ type: 'bulle', txt: 'SUPER TIR !', x: sp.x, y: sp.y - 14, c: '#ff8a3d' });
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
/**
 * Choisit le meilleur récepteur pour une passe. `assist` (réglage avancé du
 * menu) élargit ou non le geste : avec assistance, un cône large et un score
 * qui privilégie une ligne dégagée et la progression vers le but ; sans,
 * seul un cône étroit aligné sur le geste compte, sans aide positionnelle —
 * il faut viser vraiment vers le coéquipier.
 */
export function meilleurReceveur(
  state: MatchState,
  s: Skater | null,
  eq: TeamId,
  x: number,
  y: number,
  angPref: number | null,
  assist = true,
): { m: Skater; sc: number } | null {
  let best: Skater | null = null;
  let bs = -1e9;
  const coneMax = assist ? 1.1 : 0.4;
  for (const m of state.patineurs) {
    if (m.eq !== eq || m === s || m.sonne > 0) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 14) continue;
    let sc = 0;
    if (angPref !== null) {
      const e = Math.abs(angDiff(angPref, Math.atan2(dy, dx)));
      if (e > coneMax) continue;
      sc -= e * 120;
    }
    if (assist) {
      sc += ligneLibre(state, eq, x, y, m.x, m.y) ? 40 : -40;
      sc += (m.x - x) * (eq === 0 ? 1 : -1) * 0.3;
      sc -= Math.abs(d - 70) * 0.2;
      for (const o of state.patineurs) if (o.eq !== eq && Math.hypot(o.x - m.x, o.y - m.y) < 16) sc -= 25;
    }
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

export function passeJoueur(state: MatchState, s: Skater, ix: number, iy: number, assist = true): boolean {
  const pref = Math.hypot(ix, iy) > 0.3 ? Math.atan2(iy, ix) : null;
  const r =
    meilleurReceveur(state, s, s.eq, s.x, s.y, pref, assist) ?? (pref !== null && assist ? meilleurReceveur(state, s, s.eq, s.x, s.y, null, assist) : null);
  if (!r) return false;
  passeVers(state, s, r.m, assist ? 0.02 : 0.05);
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

/**
 * Rend la main automatiquement quand le palet est libre et clairement plus
 * proche d'un coéquipier que du joueur actuellement contrôlé — pour ne pas
 * laisser le joueur immobile pendant qu'un palet perdu file loin de lui.
 * N'agit jamais si quelqu'un tient déjà le palet ou qu'une passe est en
 * vol : dans ces cas, `changeJoueur` (manuel) et le pilotage IA suffisent.
 * Deux seuils (voir constants.ts) évitent les allers-retours quand deux
 * joueurs sont à peu près à égale distance.
 */
export function changeAutoSiLoin(state: MatchState): void {
  const c = state.controle;
  if (!c) return;
  const p = state.palet;
  if (p.porteur || p.passe) return;
  const dControle = Math.hypot(c.x - p.x, c.y - p.y);
  if (dControle < CHANGEMENT_AUTO_SEUIL) return;
  let best: Skater | null = null;
  let dmin = 1e9;
  for (const m of equipe(state, 0)) {
    if (m === c || m.sonne > 0) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < dmin) {
      dmin = d;
      best = m;
    }
  }
  if (best && dmin < dControle - CHANGEMENT_AUTO_MARGE) controle(state, best);
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
