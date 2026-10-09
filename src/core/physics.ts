/** Physique des joueurs : déplacement des patineurs et du gardien (le palet : palet.ts ; les chocs : collisions.ts). */

import { lancePasse, meilleurReceveur } from './actions';
import { ACCEL, BUT_DEMI, CHUTE_FROTTEMENT, GARDIEN_PASSE_LENTEUR, POKE_RECHARGE, VMAX } from './constants';
import { demiCage, effetActif, estDore, estGele, gardienEndormi, VITESSE_FACTEUR } from './pouvoirs';
import type { Goalie, MatchState, Rink, Skater } from './types';
import { angDiff, clamp } from './utils';
import { heurteBande, heurteSegment, type SegmentCage } from './collisions';

export function bougePatineur(rink: Rink, state: MatchState, s: Skater, dt: number, segsAvecFace: SegmentCage[]): void {
  s.recupCd -= dt;
  s.elanCd -= dt;
  s.pokeT = Math.max(-POKE_RECHARGE, s.pokeT - dt);
  s.esquiveT = Math.max(0, s.esquiveT - dt);
  s.esquiveVerrou = Math.max(0, s.esquiveVerrou - dt);
  s.elanT -= dt;
  if (s.sonne > 0) s.sonne -= dt;
  s.chuteT = Math.max(0, s.chuteT - dt);
  s.flashT = Math.max(0, s.flashT - dt);
  s.tirT = Math.max(0, s.tirT - dt);
  // bonus « freeze » : pris dans la glace, il ne bouge plus du tout
  if (estGele(state, s)) {
    s.vx = s.vy = 0;
    s.elanT = 0;
    s.prepaEchecT = 0;
    return;
  }
  let ix = s.ex;
  let iy = s.ey;
  if (s.sonne > 0 || state.phase === 'engagement' || state.phase === 'fin') ix = iy = 0;
  const m = Math.min(1, Math.hypot(ix, iy));
  // bonus « super vitesse » : le joueur doré va plus vite et accélère plus fort
  const turbo = effetActif(state, s.eq, 'vitesse') && estDore(state, s) ? VITESSE_FACTEUR : 1;
  // stats : ATTAQUE quand l'équipe a le palet, DÉFENSE quand c'est l'adversaire (la moitié de l'écart)
  const porteur = state.palet.porteur;
  const contexte = !porteur ? 1 : 1 + ((porteur.eq === s.eq ? s.st.att : s.st.def) - 1) * 0.5;
  const vmax = VMAX * s.vit * contexte * turbo * (s.tient ? 0.93 : 1) * (s.arme ? 1 - 0.35 * s.charge : 1);
  if (m > 0.08) {
    const ux = ix / Math.hypot(ix, iy);
    const uy = iy / Math.hypot(ix, iy);
    s.vx += ux * ACCEL * turbo * m * dt;
    s.vy += uy * ACCEL * turbo * m * dt;
    // prise de carre : on grignote la vitesse latérale pour garder du contrôle
    const lat = -s.vx * uy + s.vy * ux;
    const k = Math.min(1, 3.2 * dt);
    s.vx -= -uy * lat * k;
    s.vy -= ux * lat * k;
    // le regard suit le déplacement, sauf pendant qu'on vise un tir (il suit alors la visée)
    // ou pendant le geste de tir (il garde la direction du tir)
    if (!(s.arme && s.vise !== null) && s.tirT <= 0) {
      const cible = Math.atan2(uy, ux);
      const dA = angDiff(s.face, cible);
      s.face += clamp(dA, -13 * dt, 13 * dt);
    }
    // freinage en chasse-neige : jolie gerbe de glace
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 70 && (s.vx * ux + s.vy * uy) / sp < -0.35) {
      s.grince += dt;
      if (Math.random() < 0.5) state.evenements.push({ type: 'neige', x: s.x, y: s.y + 3, n: 1, vx: s.vx, vy: s.vy });
      if (s.grince > 0.12) {
        state.evenements.push({ type: 'raclement' });
        s.grince = -0.3;
      }
    }
  }
  // tir en charge : le joueur se tourne vers la direction du tir, même s'il patine ailleurs
  if (s.arme && s.vise !== null && s.chuteT <= 0 && s.sonne <= 0) s.face += clamp(angDiff(s.face, s.vise), -20 * dt, 20 * dt);
  // au sol, on glisse longtemps : la glace freine peu un joueur couché
  const fr = s.chuteT > 0 ? CHUTE_FROTTEMENT : m > 0.08 ? 1.1 : 2.4;
  s.vx *= Math.exp(-fr * dt);
  s.vy *= Math.exp(-fr * dt);
  const sp = Math.hypot(s.vx, s.vy);
  const lim = vmax * (s.elanT > 0 ? 1.9 : 1);
  if (sp > lim && s.chuteT <= 0) {
    const k = Math.max(lim / sp, Math.exp(-5 * dt));
    s.vx *= k;
    s.vy *= k;
  }
  if (s.sonne > 0 && s.chuteT <= 0) s.face += 14 * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const vn = heurteBande(rink, s, s.r, 0.35);
  if (vn > 90) {
    state.evenements.push({ type: 'bande', force: vn / 300 });
    state.evenements.push({ type: 'secousse', force: 1 });
  }
  for (const sg of segsAvecFace) heurteSegment(s, s.r + 0.5, sg, 0.2);
  for (const gk of state.gardiens) {
    const dx = s.x - gk.x;
    const dy = s.y - gk.y;
    const d = Math.hypot(dx, dy);
    const min = s.r + gk.r;
    if (d < min && d > 0) {
      s.x = gk.x + (dx / d) * min;
      s.y = gk.y + (dy / d) * min;
    }
  }
  s.anim += sp * dt;
}

function degage(rink: Rink, state: MatchState, gk: Goalie, dir: number): void {
  const p = state.palet;
  p.porteur = null;
  p.dernier = gk;
  p.tireur = null;
  p.qualite = 0;
  gk.cd = 0.7;
  const ox = gk.x + dir * 6;
  const oy = gk.y;
  const r = meilleurReceveur(state, null, gk.eq, ox, oy, null);
  if (r && (r.m.x - gk.x) * dir > 15) {
    lancePasse(state, ox, oy, r.m, 0.06);
    return;
  }
  const ang = Math.atan2(gk.y < rink.cy ? -0.7 : 0.7, dir);
  p.x = gk.x + Math.cos(ang) * 8;
  p.y = gk.y + Math.sin(ang) * 8;
  p.vx = Math.cos(ang) * 200;
  p.vy = Math.sin(ang) * 200;
  state.evenements.push({ type: 'frappe', puissance: 0.3 });
}

export function majGardien(rink: Rink, state: MatchState, gk: Goalie, dt: number): void {
  const p = state.palet;
  const gx = gk.eq === 0 ? rink.butG : rink.butD;
  const dir = gk.eq === 0 ? 1 : -1;
  gk.cd -= dt;
  gk.secoue = Math.max(0, gk.secoue - dt * 4);
  const demi = demiCage(state, gk.eq);
  // gardien endormi : il ne bouge plus du tout (il garde le palet s'il l'avait)
  const dort = gardienEndormi(state, gk.eq);
  let tx = p.x;
  let ty = p.y;
  // anticipation : le gardien projette un peu la trajectoire vers sa ligne
  if (!p.porteur && p.vx * dir < -60) {
    const t = (gx + dir * 6 - p.x) / p.vx;
    if (t > 0 && t < 0.8) ty = p.y + p.vy * t * gk.antic;
  }
  const cible = clamp(Math.atan2(ty - rink.cy, Math.max(-2, (tx - gx) * dir)), -1.3, 1.3);
  // une passe qui traverse devant lui le prend de court : il pivote moins vite
  const vit = gk.vit * (p.passe ? GARDIEN_PASSE_LENTEUR : 1);
  if (!dort) gk.a += clamp(cible - gk.a, -vit * dt, vit * dt);
  const sortie = Math.hypot(p.x - gx, p.y - rink.cy) < 90 ? 6 : 5;
  gk.x = gx + dir * (2.5 + Math.cos(gk.a) * sortie);
  // le gardien garde sa taille : dans une cage géante, il ne couvre plus les coins
  gk.y = rink.cy + Math.sin(gk.a) * (Math.min(BUT_DEMI, demi) - 1);

  if (p.porteur === gk) {
    p.x = gk.x + dir * 5;
    p.y = gk.y + 2;
    p.vx = p.vy = 0;
    gk.tient -= dt;
    if (gk.tient <= 0) degage(rink, state, gk, dir);
  }
}

/** La cage (ligne de but, sens vers le centre, demi-ouverture) où se trouve le palet, s'il est dedans. */

// les collisions et le palet font partie de l'interface de la physique
export * from './collisions';
export * from './palet';
