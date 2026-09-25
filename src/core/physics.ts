import { lachePalet, lancePasse, meilleurReceveur, pointCrosse, prendPalet } from './actions';
import { ACCEL, BUT_DEMI, BUT_PROF, VMAX } from './constants';
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

/** Segments des cages ; les patineurs bloquent aussi sur l'ouverture. */
export function segmentsCage(rink: Rink, avecFace: boolean): SegmentCage[] {
  const segs: SegmentCage[] = [];
  const m = BUT_DEMI;
  const cy = rink.cy;
  for (const [gx, dir] of [
    [rink.butG, 1],
    [rink.butD, -1],
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
  s.elanT -= dt;
  s.pokeT -= dt;
  if (s.sonne > 0) s.sonne -= dt;
  let ix = s.ex;
  let iy = s.ey;
  if (s.sonne > 0 || state.phase === 'engagement' || state.phase === 'fin') ix = iy = 0;
  const m = Math.min(1, Math.hypot(ix, iy));
  const vmax = VMAX * s.vit * (s.tient ? 0.93 : 1) * (s.arme ? 1 - 0.35 * s.charge : 1);
  if (m > 0.08) {
    const ux = ix / Math.hypot(ix, iy);
    const uy = iy / Math.hypot(ix, iy);
    s.vx += ux * ACCEL * m * dt;
    s.vy += uy * ACCEL * m * dt;
    // prise de carre : on grignote la vitesse latérale pour garder du contrôle
    const lat = -s.vx * uy + s.vy * ux;
    const k = Math.min(1, 3.2 * dt);
    s.vx -= -uy * lat * k;
    s.vy -= ux * lat * k;
    const cible = Math.atan2(uy, ux);
    const dA = angDiff(s.face, cible);
    s.face += clamp(dA, -13 * dt, 13 * dt);
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
  const fr = m > 0.08 ? 1.1 : 2.4;
  s.vx *= Math.exp(-fr * dt);
  s.vy *= Math.exp(-fr * dt);
  const sp = Math.hypot(s.vx, s.vy);
  const lim = vmax * (s.elanT > 0 ? 1.9 : 1);
  if (sp > lim) {
    const k = Math.max(lim / sp, Math.exp(-5 * dt));
    s.vx *= k;
    s.vy *= k;
  }
  if (s.sonne > 0) s.face += 14 * dt;
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
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d < min && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        const rec = (min - d) / 2;
        a.x -= nx * rec;
        a.y -= ny * rec;
        b.x += nx * rec;
        b.y += ny * rec;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
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
      if (o.eq === s.eq || o.sonne > 0) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d > 12) continue;
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
      o.vx += nx * 130;
      o.vy += ny * 130;
      s.vx *= 0.4;
      s.vy *= 0.4;
      s.elanT = 0;
      state.evenements.push({ type: 'secousse', force: 3 });
      state.evenements.push({ type: 'charge' });
      state.evenements.push({ type: 'etincelles', x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 - 4, n: 10, c: '#ffffff' });
      state.evenements.push({ type: 'bulle', txt: 'CHECK!', x: (s.x + o.x) / 2, y: o.y - 18, c: '#ffd35c' });
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
  let tx = p.x;
  let ty = p.y;
  // anticipation : le gardien projette un peu la trajectoire vers sa ligne
  if (!p.porteur && p.vx * dir < -60) {
    const t = (gx + dir * 6 - p.x) / p.vx;
    if (t > 0 && t < 0.8) ty = p.y + p.vy * t * gk.antic;
  }
  const cible = clamp(Math.atan2(ty - rink.cy, Math.max(-2, (tx - gx) * dir)), -1.3, 1.3);
  gk.a += clamp(cible - gk.a, -gk.vit * dt, gk.vit * dt);
  const sortie = Math.hypot(p.x - gx, p.y - rink.cy) < 90 ? 6 : 5;
  gk.x = gx + dir * (2.5 + Math.cos(gk.a) * sortie);
  gk.y = rink.cy + Math.sin(gk.a) * (BUT_DEMI - 1);

  if (p.porteur === gk) {
    p.x = gk.x + dir * 5;
    p.y = gk.y + 2;
    p.vx = p.vy = 0;
    gk.tient -= dt;
    if (gk.tient <= 0) degage(rink, state, gk, dir);
  }
}

export function majPalet(rink: Rink, state: MatchState, dt: number, segsSansFace: SegmentCage[]): void {
  const p: Puck = state.palet;
  const px0 = p.x;
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
    // contact avec les corps des patineurs (sauf s'ils le récupèrent)
    for (const s of state.patineurs) {
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
      const radEff = rayonGardienEffectif(gk, p.qualite);
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
        if (vit < seuilRattrape && gk.cd <= 0 && state.phase === 'jeu') {
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
  if (state.phase === 'jeu' && Math.abs(p.y - rink.cy) < BUT_DEMI - 0.6) {
    if (px0 >= rink.butG && p.x < rink.butG) marque(rink, state, 1);
    else if (px0 <= rink.butD && p.x > rink.butD) marque(rink, state, 0);
  }
}

function marque(rink: Rink, state: MatchState, eq: 0 | 1): void {
  state.score[eq]++;
  state.tirs[eq]++;
  state.phase = 'but';
  state.phaseT = 2.6;
  state.lampe[1 - eq] = 1;
  state.excite = 1;
  state.marqueur = eq;
  state.buteur = state.palet.dernier;
  const p = state.palet;
  state.evenements.push({ type: 'confettis', x: eq === 0 ? rink.butD : rink.butG, y: rink.cy, eq });
  state.evenements.push({ type: 'etincelles', x: p.x, y: p.y, n: 20, c: '#ffd35c' });
  state.evenements.push({ type: 'secousse', force: 5 });
  state.evenements.push({ type: 'flash', force: 0.7 });
  state.evenements.push({
    type: 'annonce',
    txt: 'BUT !',
    sous: `${state.score[0]} - ${state.score[1]}`,
    c: '#ffd35c',
    duree: 2.4,
    eq,
  });
  state.evenements.push({ type: 'klaxon' });
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
    let dmin = 7;
    for (const s of state.patineurs) {
      if (s.recupCd > 0 || s.sonne > 0) continue;
      const sp = pointCrosse(s);
      // à la crosse, ou dans les patins : on contrôle aussi un palet qui arrive dans les pieds
      const d = Math.min(Math.hypot(p.x - sp.x, p.y - sp.y), Math.hypot(p.x - s.x, p.y - s.y) - s.r + 1);
      const rel = Math.hypot(p.vx - s.vx, p.vy - s.vy);
      if (d < dmin && rel < 320) {
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
      if (o.eq === c.eq || o.sonne > 0 || o.recupCd > 0) continue;
      const sp = pointCrosse(o);
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      const portee = o.pokeT > 0 ? 10 : 6.5;
      const taux = o.humain ? (o.pokeT > 0 ? 7 : 0.7) : state.nivEq[o.eq].poke;
      if (d < portee && Math.random() < taux * dt) {
        lachePalet(state, c, 0.4);
        const a = o.face + alea(-0.8, 0.8);
        p.vx = Math.cos(a) * 80 + c.vx * 0.3;
        p.vy = Math.sin(a) * 80 + c.vy * 0.3;
        p.dernier = o;
        p.qualite = 0;
        o.recupCd = 0.06;
        state.evenements.push({ type: 'frappe', puissance: 0.1 });
        state.evenements.push({ type: 'bulle', txt: 'VOLE!', x: p.x, y: p.y - 14, c: '#ffd35c' });
        break;
      }
    }
  }
}
