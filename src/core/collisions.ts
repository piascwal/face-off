/** Collisions : bandes, poteaux et filets des cages, et patineurs entre eux. */

import { esquive, lachePalet } from './actions';
import { BUT_DEMI, BUT_PROF, ECHEC_FIGE, FLASH_T } from './constants';
import { estGele, pouvoirActif } from './pouvoirs';
import type { MatchState, Rink } from './types';
import { alea, clamp } from './utils';

export type Mobile = { x: number; y: number; vx: number; vy: number };
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
      // PHYSIQUE : l'attaquant contre le défenseur ; > 1 le choc est plus fort, < 1 il est encaissé
      const force = clamp(s.st.phys / o.st.phys, 0.75, 1.3);
      // un porteur bien plus costaud que son assaillant garde parfois le palet malgré le choc
      const garde = o.tient && Math.random() < clamp((1 - force) * 1.5, 0, 0.45);
      if (o.tient && !garde) {
        lachePalet(state, o, 0.9);
        p.vx = nx * 110 + o.vx * 0.4 + alea(-30, 30);
        p.vy = ny * 110 + o.vy * 0.4 + alea(-30, 30);
        p.dernier = s;
        p.qualite = 0;
      }
      o.sonne = 0.45 * force;
      o.flashT = FLASH_T;
      state.figeT = Math.max(state.figeT, ECHEC_FIGE);
      o.vx += nx * 130 * force;
      o.vy += ny * 130 * force;
      // un assaillant plus faible que sa cible rebondit davantage
      const recul = clamp(0.4 / force, 0.25, 0.6);
      s.vx *= recul;
      s.vy *= recul;
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
