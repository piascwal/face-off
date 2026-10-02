import {
  CHANGEMENT_AUTO_MARGE,
  CHANGEMENT_AUTO_SEUIL,
  COMBO_BONUS,
  COMBO_PASSES_MAX,
  CHUTE_GLISSE,
  ELAN_CD_PALET,
  ESQUIVE_FIGE,
  ESQUIVE_PORTEE,
  ESQUIVE_SONNE,
  ESQUIVE_T,
  FLASH_T,
  POKE_RECHARGE,
  POKE_T,
  TIR_ANIM_S,
  UNE_TOUCHE_BONUS,
  UNE_TOUCHE_S,
} from './constants';
import { cassePasses, comptePasse, demiCage, effetActif, tirLoupe, tirPuissant } from './pouvoirs';
import { qualiteDuTir } from './shooting';
import { equipe } from './state-helpers';
import type { Goalie, MatchState, Porteur, Rink, Skater, TeamId } from './types';
import { estPatineur } from './types';
import { angDiff, clamp, pointSegDist } from './utils';

export const pointCrosse = (s: Skater): { x: number; y: number } => ({
  x: s.x + Math.cos(s.face) * 8,
  y: s.y + Math.sin(s.face) * 8 + 1,
});

/** Chaque humain ne pilote qu'un seul patineur de son équipe à la fois. */
export function controle(state: MatchState, s: Skater): void {
  if (state.mode !== 'match' || !state.humains[s.eq] || state.controles[s.eq] === s) return;
  // freeze de son équipe : on garde la main sur le seul joueur qui bouge
  if (state.controles[s.eq] && effetActif(state, s.eq, 'freeze')) return;
  const a = state.controles[s.eq];
  if (a) {
    a.humain = false;
    a.arme = false;
    a.charge = 0;
    a.vise = null;
    a.ia.t = 0;
  }
  s.humain = true;
  s.arme = false;
  s.charge = 0;
  state.controles[s.eq] = s;
}

export function prendPalet(state: MatchState, qui: Porteur): void {
  const p = state.palet;
  const passeReussie = estPatineur(qui) && p.passe?.vers === qui;
  const equipePrecedente = p.dernier?.eq;
  p.porteur = qui;
  p.dernier = qui;
  p.passe = null;
  p.qualite = 0;
  p.puissant = false;
  // le palet change de camp : la séquence de passes de l'équipe qui le perd s'arrête là
  if (equipePrecedente !== undefined && equipePrecedente !== qui.eq) {
    state.combo[equipePrecedente] = 0;
    cassePasses(state, equipePrecedente);
  }
  // un gardien qui prend le palet coupe les séries des deux équipes
  if (!estPatineur(qui)) {
    cassePasses(state, 0);
    cassePasses(state, 1);
  }
  if (estPatineur(qui)) {
    qui.tient = true;
    state.evenements.push({ type: 'touche' });
    controle(state, qui);
    if (passeReussie) {
      state.stats.passes[qui.eq]++;
      state.reception = { qui, t: state.temps };
      const n = ++state.combo[qui.eq];
      state.stats.comboMax[qui.eq] = Math.max(state.stats.comboMax[qui.eq], n);
      // la passe qui décroche un bonus n'affiche que le « BONUS » doré
      if (!comptePasse(state, qui.eq, qui) && n >= 2) state.evenements.push({ type: 'bulle', txt: `COMBO x${n}`, x: qui.x, y: qui.y - 16, c: '#ffd35c' });
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

/** Le patineur vient-il de recevoir une passe (tir sur réception possible) ? */
export function surReception(state: MatchState, s: Skater): boolean {
  const r = state.reception;
  return r !== null && r.qui === s && s.tient && state.temps - r.t < UNE_TOUCHE_S;
}

export function tir(state: MatchState, rink: Rink, s: Skater, ang: number, puissance: number): void {
  // bonus « loupé complet » de l'adversaire : ce tir part vers la caméra (raté d'office)
  const depart = pointCrosse(s);
  if (tirLoupe(state, s, depart.x, depart.y)) {
    s.tirT = TIR_ANIM_S;
    state.combo[s.eq] = 0;
    state.reception = null;
    return;
  }
  const p = state.palet;
  // un tir consomme la combo de passes en cours
  const passes = state.combo[s.eq];
  const uneTouche = surReception(state, s);
  state.combo[s.eq] = 0;
  state.reception = null;
  // tir sur réception : il part fort même si on n'a pas eu le temps de le charger
  if (uneTouche) puissance = Math.max(puissance, 0.55);
  // handicap « tir puissant » : palet plus rapide, un peu plus dur à arrêter
  const renfort = state.bonus[s.eq] === 'tir';
  // bonus « tir surpuissant » en cours : ce tir part bien plus vite
  const fort = tirPuissant(state, s);
  const v = (150 + 290 * puissance) * (renfort ? 1.15 : 1) * fort.vitesse;
  lachePalet(state, s, 0.3);
  s.tirT = TIR_ANIM_S;
  // le joueur finit tourné vers son tir : la crosse (d'où part le palet) est de ce côté
  s.face = ang;
  const sp = pointCrosse(s);
  p.x = sp.x;
  p.y = sp.y;
  p.vx = Math.cos(ang) * v + s.vx * 0.1;
  p.vy = Math.sin(ang) * v + s.vy * 0.1;
  p.tireur = s.eq;
  p.dernier = s;
  p.passe = null;
  p.qualite = qualiteDuTir(rink, s.eq, sp.x, sp.y, ang, puissance, state.gardiens[1 - s.eq] as Goalie, demiCage(state, s.eq === 0 ? 1 : 0));
  p.passes = passes;
  p.uneTouche = uneTouche;
  // le jeu de passes paie : chaque passe de la séquence rend le tir plus dangereux,
  // et un tir sur réception prend le gardien à contre-pied
  let bonus = Math.min(passes, COMBO_PASSES_MAX) * COMBO_BONUS;
  if (uneTouche) bonus += UNE_TOUCHE_BONUS;
  if (renfort) bonus += 0.06;
  bonus += fort.bonus;
  if (p.qualite > 0) p.qualite = Math.min(0.97, p.qualite + bonus);
  state.evenements.push({ type: 'frappe', puissance });
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 3 + Math.round(puissance * 8) });
  if (puissance > 0.7) state.evenements.push({ type: 'secousse', force: 1.5 });
  if (p.puissant) state.evenements.push({ type: 'bulle', txt: 'SURPUISSANT !', x: sp.x, y: sp.y - 14, c: '#ff8a2a' });
  else if (uneTouche) state.evenements.push({ type: 'bulle', txt: 'UNE-TOUCHE !', x: sp.x, y: sp.y - 14, c: '#8fe3ff' });
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
/** Le point (x, y) est-il dans la moitié de patinoire que défend l'équipe `eq` ? */
export function dansSaMoitie(state: MatchState, eq: TeamId, x: number): boolean {
  const [nous, eux] = [state.gardiens[eq], state.gardiens[1 - eq]];
  if (!nous || !eux || nous.x === eux.x) return false;
  return Math.abs(x - nous.x) < Math.abs(x - eux.x);
}

export function lancePasse(state: MatchState, x: number, y: number, m: Skater, err: number): void {
  const p = state.palet;
  // dans sa moitié, loin de la pression : une passe plus précise et plus sûre
  const facile = dansSaMoitie(state, m.eq, x);
  if (facile) err *= 0.5;
  const d = Math.hypot(m.x - x, m.y - y);
  // passes appuyées : moins de temps en l'air, moins de risque d'interception
  const v = clamp(160 + d * 0.95, 180, 330);
  const t = d / v;
  const tx = m.x + m.vx * t * 0.9;
  const ty = m.y + m.vy * t * 0.9;
  const a = Math.atan2(ty - y, tx - x) + (Math.random() + Math.random() - 1) * err;
  p.x = x;
  p.y = y;
  p.vx = Math.cos(a) * v;
  p.vy = Math.sin(a) * v;
  p.passe = { vers: m, t: 1.3, facile };
  p.tireur = null;
  p.puissant = false;
  p.qualite = 0;
  state.reception = null;
  state.evenements.push({ type: 'frappe', puissance: 0.25 });
  state.evenements.push({ type: 'neige', x, y, n: 3, vx: -p.vx * 0.2, vy: -p.vy * 0.2 });
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
export function changeJoueur(state: MatchState, eq: TeamId): void {
  const p = state.palet;
  let best: Skater | null = null;
  let dmin = 1e9;
  for (const m of equipe(state, eq)) {
    if (m === state.controles[eq]) continue;
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
  const p = state.palet;
  if (p.porteur || p.passe) return;
  for (const c of state.controles) if (c) changeAutoEquipe(state, c);
}

function changeAutoEquipe(state: MatchState, c: Skater): void {
  const p = state.palet;
  const dControle = Math.hypot(c.x - p.x, c.y - p.y);
  if (dControle < CHANGEMENT_AUTO_SEUIL) return;
  let best: Skater | null = null;
  let dmin = 1e9;
  for (const m of equipe(state, c.eq)) {
    if (m === c || m.sonne > 0) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < dmin) {
      dmin = d;
      best = m;
    }
  }
  if (best && dmin < dControle - CHANGEMENT_AUTO_MARGE) controle(state, best);
}

/**
 * Le défenseur qui arrive en mise en échec sur `s` (en élan, à portée, et
 * lancé vers lui), s'il y en a un : c'est la fenêtre d'esquive.
 */
export function menaceEchec(state: MatchState, s: Skater): Skater | null {
  if (!s.tient || s.esquiveT > 0) return null;
  for (const o of state.patineurs) {
    if (o.eq === s.eq || o.sonne > 0 || (o.elanT <= 0 && o.prepaEchecT <= 0)) continue;
    const dx = s.x - o.x;
    const dy = s.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > ESQUIVE_PORTEE) continue;
    // la préparation vise toujours le porteur : la menace est certaine
    if (o.prepaEchecT > 0) return o;
    const v = Math.hypot(o.vx, o.vy);
    if (v >= 1 && (o.vx * dx + o.vy * dy) / (v * (d || 1)) > 0.6) return o;
  }
  return null;
}

/**
 * Esquive : le porteur fait un pas de côté, à l'opposé de la trajectoire du
 * défenseur, qui passe à côté, tombe et glisse sur la glace dans le sens de
 * sa charge. Un court arrêt sur image et un flash blanc soulignent le moment.
 */
export function esquive(state: MatchState, s: Skater, o: Skater): void {
  // sens de la charge : sa vitesse, ou vers le porteur s'il la préparait encore
  const v = Math.hypot(o.vx, o.vy);
  const [ax, ay] = v > 30 ? [o.vx, o.vy] : [s.x - o.x, s.y - o.y];
  const n = Math.hypot(ax, ay) || 1;
  const ux = ax / n;
  const uy = ay / n;
  // de quel côté de la trajectoire est le porteur : on s'en écarte encore
  const cote = Math.sign((s.x - o.x) * -uy + (s.y - o.y) * ux) || 1;
  s.vx += -uy * cote * 120;
  s.vy += ux * cote * 120;
  s.esquiveT = ESQUIVE_T;
  s.esquiveVerrou = 0;
  s.elanCd = Math.max(s.elanCd, 0.6);
  o.elanT = 0;
  o.prepaEchecT = 0;
  o.sonne = ESQUIVE_SONNE;
  o.chuteT = ESQUIVE_SONNE;
  o.chuteD = ESQUIVE_SONNE;
  o.flashT = FLASH_T;
  o.face = Math.atan2(uy, ux);
  o.vx = ux * CHUTE_GLISSE;
  o.vy = uy * CHUTE_GLISSE;
  state.figeT = ESQUIVE_FIGE;
  state.evenements.push({ type: 'elan' });
  state.evenements.push({ type: 'secousse', force: 1.5 });
  state.evenements.push({ type: 'etincelles', x: o.x, y: o.y - 8, n: 8, c: '#ffd35c' });
  state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 6, vx: uy * cote * 80, vy: -ux * cote * 80 });
  state.evenements.push({ type: 'bulle', txt: 'ESQUIVÉ !', x: s.x, y: s.y - 22, c: '#8fe3ff' });
  if (s.humain || o.humain) state.evenements.push({ type: 'vibre', ms: 25 });
}

/** Coup de crosse (défense) : pendant `POKE_T`, la crosse vole le palet de plus loin et bien plus souvent. */
export function coupDeCrosse(state: MatchState, s: Skater): void {
  // prêt une fois la recharge écoulée (pokeT redescendu à -POKE_RECHARGE)
  if (s.tient || s.pokeT > -POKE_RECHARGE + 1e-3 || s.sonne > 0) return;
  s.pokeT = POKE_T;
  const sp = pointCrosse(s);
  state.evenements.push({ type: 'etincelles', x: sp.x, y: sp.y, n: 3, c: '#c9d2e3' });
  state.evenements.push({ type: 'frappe', puissance: 0.05 });
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
  s.elanCd = s.tient ? ELAN_CD_PALET : 1.0;
  state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 6, vx: -s.vx, vy: -s.vy });
  state.evenements.push({ type: 'elan' });
}
