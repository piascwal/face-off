import { esquive, lachePalet, lancePasse, meilleurReceveur, pointCrosse, prendPalet } from './actions';
import {
  ANNONCE_BUT_S,
  ACCEL,
  BUT_DEMI,
  BUT_PROF,
  CHUTE_FROTTEMENT,
  ECHEC_FIGE,
  FLASH_T,
  GARDIEN_PASSE_LENTEUR,
  INTERCEPTION_RAYON,
  PASSE_AIMANT,
  PASSE_FACILE_MARGE,
  POKE_RECHARGE,
  RECEPTION_RAYON,
  VMAX,
} from './constants';
import {
  BLACKOUT_INTERCEPTION,
  BLACKOUT_VOL,
  cassePasses,
  dansLeNoir,
  DEF_POUVOIRS,
  demiCage,
  effetActif,
  ENDORMI_RAYON,
  estDore,
  estGele,
  finPouvoir,
  gardienEndormi,
  pouvoirActif,
  renversePuissant,
  VITESSE_FACTEUR,
} from './pouvoirs';
import { rayonGardienEffectif, seuilRattrapeEffectif } from './shooting';
import type { Goalie, MatchState, Puck, Rink, Skater } from './types';
import { alea, angDiff, clamp } from './utils';

type Mobile = { x: number; y: number; vx: number; vy: number };
export type SegmentCage = [number, number, number, number, boolean];

export function heurteBande(rink: Rink, o: Mobile, rad: number, rest: number): number {
  const ix0 = rink.x + rink.r;
  const ix1 = rink.x + rink.w - rink.r;
  const iy0 = rink.y + rink.r;
  const iy1 = rink.y + rink.h - rink.r;
  const qx = clamp(o.x, ix0, ix1);
  const qy = clamp(o.y, iy0, iy1);
  const dx = o.x - qx;
  const dy = o.y - qy;
  const d = Math.hypot(dx, dy);
  const lim = rink.r - rad;
  if (d > lim && d > 0) {
    const nx = dx / d;
    const ny = dy / d;
    o.x = qx + nx * lim;
    o.y = qy + ny * lim;
    const vn = o.vx * nx + o.vy * ny;
    if (vn > 0) {
      o.vx -= (1 + rest) * vn * nx;
      o.vy -= (1 + rest) * vn * ny;
      return vn;
    }
  }
  return 0;
}

/**
 * Segments des cages ; les patineurs bloquent aussi sur l'ouverture.
 * `demis` : demi-largeur de chaque cage (gauche, droite), qu'un bonus change.
 */
export function segmentsCage(rink: Rink, avecFace: boolean, demis: [number, number] = [BUT_DEMI, BUT_DEMI]): SegmentCage[] {
  const segs: SegmentCage[] = [];
  const cy = rink.cy;
  for (const [gx, dir, m] of [
    [rink.butG, 1, demis[0]],
    [rink.butD, -1, demis[1]],
  ] as const) {
    const fond = gx - dir * BUT_PROF;
    segs.push([fond, cy - m, fond, cy + m, false]);
    segs.push([fond, cy - m, gx, cy - m, true]);
    segs.push([fond, cy + m, gx, cy + m, true]);
    if (avecFace) segs.push([gx, cy - m, gx, cy + m, false]);
  }
  return segs;
}

export function heurteSegment(o: Mobile, rad: number, s: SegmentCage, rest: number): { vn: number; t: number } | null {
  const [ax, ay, bx, by] = s;
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp(((o.x - ax) * abx + (o.y - ay) * aby) / (abx * abx + aby * aby), 0, 1);
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = o.x - qx;
  const dy = o.y - qy;
  const d = Math.hypot(dx, dy);
  if (d < rad && d > 1e-4) {
    const nx = dx / d;
    const ny = dy / d;
    o.x = qx + nx * rad;
    o.y = qy + ny * rad;
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) {
      o.vx -= (1 + rest) * vn * nx;
      o.vy -= (1 + rest) * vn * ny;
      return { vn: -vn, t };
    }
    return { vn: 0, t };
  }
  return null;
}

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
  const vmax = VMAX * s.vit * turbo * (s.tient ? 0.93 : 1) * (s.arme ? 1 - 0.35 * s.charge : 1);
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

export function collisionsPatineurs(state: MatchState): void {
  const L = state.patineurs;
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i]!;
      const b = L[j]!;
      // un joueur au sol glisse sous les autres sans les gêner
      if (a.chuteT > 0 || b.chuteT > 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d < min && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        // un joueur gelé (bonus freeze) ne se laisse pas pousser : l'autre prend tout le recul
        const ga = estGele(state, a);
        const gb = estGele(state, b);
        if (ga && gb) continue;
        const ka = ga ? 0 : gb ? 1 : 0.5;
        const kb = 1 - ka;
        a.x -= nx * (min - d) * ka;
        a.y -= ny * (min - d) * ka;
        b.x += nx * (min - d) * kb;
        b.y += ny * (min - d) * kb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0 && !ga && !gb) {
          const k = (-rv * 0.8) / 2;
          a.vx -= nx * k;
          a.vy -= ny * k;
          b.vx += nx * k;
          b.vy += ny * k;
        }
      }
    }
  }
  // mise en échec : un élan qui percute un adversaire ; le porteur perd le palet
  if (state.phase !== 'jeu') return;
  for (const s of L) {
    if (s.elanT <= 0) continue;
    for (const o of L) {
      if (o.eq === s.eq || o.sonne > 0 || o.esquiveT > 0) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d > 12) continue;
      // bonus « full esquive » : toute mise en échec contre cette équipe glisse en esquive (le coup de crosse, lui, passe toujours)
      if (pouvoirActif(state, o.eq, 'savon')) {
        esquive(state, o, s);
        state.evenements.push({ type: 'etincelles', x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 - 4, n: 12, c: '#5cc8ff' });
        break;
      }
      const nx = (o.x - s.x) / (d || 1);
      const ny = (o.y - s.y) / (d || 1);
      const p = state.palet;
      if (o.tient) {
        lachePalet(state, o, 0.9);
        p.vx = nx * 110 + o.vx * 0.4 + alea(-30, 30);
        p.vy = ny * 110 + o.vy * 0.4 + alea(-30, 30);
        p.dernier = s;
        p.qualite = 0;
      }
      o.sonne = o.tient ? 0.8 : 0.45;
      o.flashT = FLASH_T;
      state.figeT = Math.max(state.figeT, ECHEC_FIGE);
      o.vx += nx * 130;
      o.vy += ny * 130;
      s.vx *= 0.4;
      s.vy *= 0.4;
      s.elanT = 0;
      state.evenements.push({ type: 'secousse', force: 3 });
      state.evenements.push({ type: 'charge' });
      const ix = (s.x + o.x) / 2;
      const iy = (s.y + o.y) / 2 - 4;
      state.evenements.push({ type: 'etincelles', x: ix, y: iy, n: 10, c: '#ffffff' });
      state.evenements.push({ type: 'etincelles', x: ix, y: iy, n: 8, c: '#ffd35c' });
      state.evenements.push({ type: 'onde', x: ix, y: iy + 3, r: 24, c: '#ffffff' });
      state.stats.checks[s.eq]++;
      if (s.humain || o.humain) state.evenements.push({ type: 'vibre', ms: 35 });
      break;
    }
  }
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
function cageDuPalet(rink: Rink, state: MatchState, p: Puck): { gx: number; dir: 1 | -1; demi: number } | null {
  const [mg, md] = [demiCage(state, 0), demiCage(state, 1)];
  if (p.x < rink.butG && p.x > rink.butG - BUT_PROF - 2 && Math.abs(p.y - rink.cy) <= mg) return { gx: rink.butG, dir: 1, demi: mg };
  if (p.x > rink.butD && p.x < rink.butD + BUT_PROF + 2 && Math.abs(p.y - rink.cy) <= md) return { gx: rink.butD, dir: -1, demi: md };
  return null;
}

/**
 * Après un but, le palet reste au fond des filets : il y glisse en perdant
 * vite sa vitesse, rebondit mollement sur les parois, et ni le gardien ni
 * les patineurs ne peuvent plus le repousser dehors. Sans ça, un tir qui
 * rentre ressortait souvent aussitôt, et on ne voyait pas qu'il y avait but.
 */
function retiensDansFilet(rink: Rink, p: Puck, cage: { gx: number; dir: 1 | -1; demi: number }, dt: number): void {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const f = Math.exp(-4 * dt);
  p.vx *= f;
  p.vy *= f;
  const fond = cage.gx - cage.dir * BUT_PROF;
  const x0 = Math.min(fond, cage.gx) + p.r;
  const x1 = Math.max(fond, cage.gx) - p.r;
  const y0 = rink.cy - cage.demi + p.r;
  const y1 = rink.cy + cage.demi - p.r;
  if (p.x < x0 || p.x > x1) {
    p.x = clamp(p.x, x0, x1);
    p.vx *= -0.2;
  }
  if (p.y < y0 || p.y > y1) {
    p.y = clamp(p.y, y0, y1);
    p.vy *= -0.2;
  }
}

export function majPalet(rink: Rink, state: MatchState, dt: number, segsSansFace: SegmentCage[]): void {
  const p: Puck = state.palet;
  const px0 = p.x;
  if (state.phase === 'but' && !p.porteur) {
    const cage = cageDuPalet(rink, state, p);
    if (cage) {
      retiensDansFilet(rink, p, cage, dt);
      return;
    }
  }
  if (p.porteur && 'face' in p.porteur) {
    const s = p.porteur;
    const sp = pointCrosse(s);
    const t = state.temps * 13;
    const perp = Math.sin(t) * 1.3;
    const tx = sp.x - Math.sin(s.face) * perp;
    const ty = sp.y + Math.cos(s.face) * perp;
    const k = Math.min(1, 30 * dt);
    p.x += (tx - p.x) * k;
    p.y += (ty - p.y) * k;
    p.vx = s.vx;
    p.vy = s.vy;
    heurteBande(rink, p, p.r, 0);
    for (const sg of segsSansFace) heurteSegment(p, p.r, sg, 0);
  } else if (!p.porteur) {
    // passe : le palet est légèrement attiré vers la crosse du receveur quand il arrive
    const rec = p.passe?.vers;
    if (rec) {
      const sp = pointCrosse(rec);
      const dx = sp.x - p.x;
      const dy = sp.y - p.y;
      const d = Math.hypot(dx, dy);
      const v = Math.hypot(p.vx, p.vy);
      if (d < PASSE_AIMANT && d > 0.5 && v > 20) {
        const k = Math.min(1, 6 * dt);
        p.vx += ((dx / d) * v - p.vx) * k;
        p.vy += ((dy / d) * v - p.vy) * k;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const f = Math.exp(-0.45 * dt);
    p.vx *= f;
    p.vy *= f;
    const v = Math.hypot(p.vx, p.vy);
    if (v < 6) {
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    const vn = heurteBande(rink, p, p.r, 0.72);
    if (vn > 25) {
      state.evenements.push({ type: 'bande', force: vn / 400 });
      if (vn > 200) state.evenements.push({ type: 'secousse', force: 1.2 });
      state.evenements.push({ type: 'neige', x: p.x, y: p.y, n: 2 });
    }
    for (const sg of segsSansFace) {
      const r = heurteSegment(p, p.r, sg, 0.35);
      if (r && r.vn > 40) {
        const extremite = sg[4] && r.t > 0.85;
        if (extremite && r.vn > 120) {
          state.evenements.push({ type: 'poteau' });
          state.evenements.push({ type: 'bulle', txt: 'POTEAU!', x: p.x, y: p.y - 12, c: '#ffffff' });
          state.evenements.push({ type: 'secousse', force: 2 });
        } else {
          state.evenements.push({ type: 'bande', force: r.vn / 600 });
        }
      }
    }
    // tir surpuissant : il renverse les adversaires sur sa route et les traverse
    renversePuissant(state);
    // contact avec les corps des patineurs (sauf s'ils le récupèrent)
    for (const s of state.patineurs) {
      if (p.puissant && s.eq !== p.tireur) continue;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      const min = s.r + p.r - 1;
      if (d < min && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        p.x = s.x + nx * min;
        p.y = s.y + ny * min;
        const vn2 = (p.vx - s.vx) * nx + (p.vy - s.vy) * ny;
        if (vn2 < 0) {
          p.vx -= 1.3 * vn2 * nx;
          p.vy -= 1.3 * vn2 * ny;
        }
      }
    }
    // arrêts des gardiens — la qualité du tir (puissance + placement) module
    // le rayon effectif et le seuil de capture, donc la probabilité de but.
    for (const gk of state.gardiens) {
      const dort = gardienEndormi(state, gk.eq);
      const radEff = rayonGardienEffectif(gk, p.qualite) * (dort ? ENDORMI_RAYON : 1);
      const dx = p.x - gk.x;
      const dy = p.y - gk.y;
      const d = Math.hypot(dx, dy);
      const min = radEff + p.r;
      if (d < min && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        p.x = gk.x + nx * min;
        p.y = gk.y + ny * min;
        const vit = Math.hypot(p.vx, p.vy);
        const versBut = p.tireur !== null && p.tireur !== gk.eq;
        const seuilRattrape = seuilRattrapeEffectif(p.qualite);
        if (vit < seuilRattrape && gk.cd <= 0 && state.phase === 'jeu' && !dort) {
          prendPalet(state, gk);
          gk.tient = 0.75;
          if (versBut && vit > 60) {
            state.arrets[gk.eq]++;
            state.tirs[1 - gk.eq]++;
            state.evenements.push({ type: 'bulle', txt: 'ARRET!', x: gk.x, y: gk.y - 18, c: '#ffffff' });
          }
          p.tireur = null;
        } else {
          const vn2 = p.vx * nx + p.vy * ny;
          if (vn2 < 0) {
            p.vx -= 1.45 * vn2 * nx;
            p.vy -= 1.45 * vn2 * ny;
            const tg = alea(-50, 50);
            p.vx += -ny * tg;
            p.vy += nx * tg;
          }
          gk.secoue = 1;
          state.evenements.push({ type: 'jambiere' });
          if (versBut && vit > 115 && state.phase === 'jeu') {
            state.arrets[gk.eq]++;
            state.tirs[1 - gk.eq]++;
            state.evenements.push({ type: 'bulle', txt: 'ARRET!', x: gk.x, y: gk.y - 18, c: '#ffffff' });
            state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 6, c: '#ffffff' });
            if (state.mode === 'match' && gk.eq === 1) state.excite = Math.max(state.excite, 0.3);
            state.evenements.push({ type: 'ovation', niveau: 0.25 });
          }
          p.tireur = null;
        }
      }
    }
  }

  // but ! (on franchit la ligne par l'avant, entre les poteaux)
  if (state.phase === 'jeu') {
    const dy = Math.abs(p.y - rink.cy);
    if (px0 >= rink.butG && p.x < rink.butG && dy < demiCage(state, 0) - 0.6) marque(rink, state, 1);
    else if (px0 <= rink.butD && p.x > rink.butD && dy < demiCage(state, 1) - 0.6) marque(rink, state, 0);
  }
}

function marque(rink: Rink, state: MatchState, eq: 0 | 1): void {
  // bonus « but x2 » : ce but compte double, et le bonus est consommé
  const double = pouvoirActif(state, eq, 'double');
  state.score[eq] += double ? 2 : 1;
  if (double) finPouvoir(state, eq);
  // un but met fin à tous les bonus, des deux côtés (même un tirage en cours)
  for (const e of [0, 1] as const) {
    finPouvoir(state, e);
    cassePasses(state, e);
    const pv = state.pouvoirs?.[e];
    if (pv) {
      pv.pret = null;
      pv.tirage = 0;
    }
  }
  state.palet.puissant = false;
  state.tirs[eq]++;
  state.phase = 'but';
  state.phaseT = state.dureeBut;
  state.lampe[1 - eq] = 1;
  state.excite = 1;
  state.marqueur = eq;
  state.buteur = state.palet.dernier;
  const p = state.palet;
  const collectif = p.passes >= 2;
  state.evenements.push({ type: 'confettis', x: eq === 0 ? rink.butD : rink.butG, y: rink.cy, eq });
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 20, c: '#ffd35c' });
  state.evenements.push({ type: 'secousse', force: 5 });
  state.evenements.push({ type: 'flash', force: 0.7 });
  state.evenements.push({
    type: 'annonce',
    // un but au bout d'un vrai jeu de passes se fête plus fort
    txt: double ? `${DEF_POUVOIRS.double.nom} !` : collectif ? 'BUT COLLECTIF !' : 'BUT !',
    sous: collectif ? `${p.passes} PASSES  ${state.score[0]} - ${state.score[1]}` : `${state.score[0]} - ${state.score[1]}`,
    c: '#ffd35c',
    duree: ANNONCE_BUT_S,
    eq,
    celeb: Math.floor(Math.random() * 1000),
  });
  if (collectif) {
    state.evenements.push({ type: 'confettis', x: rink.cx, y: rink.cy, eq });
    state.evenements.push({ type: 'secousse', force: 3 });
  }
  state.evenements.push({ type: 'klaxon' });
  state.evenements.push({ type: 'but', eq, buteur: state.buteur });
  state.evenements.push({ type: 'ovation', niveau: 1 });
  if (state.mode === 'match') state.evenements.push({ type: 'vibre', ms: eq === 0 ? [60, 40, 120] : 80 });
  for (const s of state.patineurs) {
    s.arme = false;
    s.charge = 0;
  }
  if (state.mode === 'demo' && Math.max(...state.score) >= 9) state.score = [0, 0];
}

export function recuperations(state: MatchState, dt: number): void {
  const p = state.palet;
  if (state.phase !== 'jeu' && state.phase !== 'but') return;
  if (!p.porteur && state.phase === 'jeu') {
    let meilleur: Skater | null = null;
    let dmin = Infinity;
    for (const s of state.patineurs) {
      if (s.recupCd > 0 || s.sonne > 0 || estGele(state, s)) continue;
      const sp = pointCrosse(s);
      // à la crosse, ou dans les patins : on contrôle aussi un palet qui arrive dans les pieds
      const d = Math.min(Math.hypot(p.x - sp.x, p.y - sp.y), Math.hypot(p.x - s.x, p.y - s.y) - s.r + 1);
      const rel = Math.hypot(p.vx - s.vx, p.vy - s.vy);
      // pendant une passe, le receveur capte de plus loin, un adversaire doit être bien placé
      const visee = p.passe?.vers === s;
      const marge = p.passe?.facile ? PASSE_FACILE_MARGE : 0;
      // blackout adverse : dans le noir, on voit mal le palet qui passe
      const noir = dansLeNoir(state, s.eq) ? BLACKOUT_INTERCEPTION : 1;
      const portee = !p.passe ? 7 : visee ? RECEPTION_RAYON + marge : s.eq === p.passe.vers.eq ? 7 : (INTERCEPTION_RAYON - marge) * noir;
      if (d < portee && d < dmin && rel < (visee ? 420 : 320)) {
        dmin = d;
        meilleur = s;
      }
    }
    if (meilleur) prendPalet(state, meilleur);
  }
  if (p.passe) {
    p.passe.t -= dt;
    if (p.passe.t <= 0 || p.porteur) p.passe = null;
  }
  // harponnage : une crosse adverse qui traîne près du palet peut le chiper
  if (p.porteur && 'face' in p.porteur && state.phase === 'jeu') {
    const c = p.porteur;
    for (const o of state.patineurs) {
      if (o.eq === c.eq || o.sonne > 0 || o.recupCd > 0 || estGele(state, o)) continue;
      const sp = pointCrosse(o);
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      const portee = o.pokeT > 0 ? 10 : 6.5;
      const taux = (o.humain ? (o.pokeT > 0 ? 7 : 0.7) : state.nivEq[o.eq].poke) * (dansLeNoir(state, o.eq) ? BLACKOUT_VOL : 1);
      if (d < portee && Math.random() < taux * dt) {
        lachePalet(state, c, 0.4);
        const a = o.face + alea(-0.8, 0.8);
        p.vx = Math.cos(a) * 80 + c.vx * 0.3;
        p.vy = Math.sin(a) * 80 + c.vy * 0.3;
        p.dernier = o;
        p.qualite = 0;
        o.recupCd = 0.06;
        state.evenements.push({ type: 'frappe', puissance: 0.1 });
        state.evenements.push({ type: 'bulle', txt: 'VOLÉ !', x: p.x, y: p.y - 14, c: '#ffd35c' });
        break;
      }
    }
  }
}
