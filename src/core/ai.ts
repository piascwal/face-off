import { elan, meilleurReceveur, passeVers, tir } from './actions';
import { VMAX } from './constants';
import { angleVersCoinLoin, butAttaque, butDefendu, sensAttaque } from './shooting';
import { equipe, plusProche } from './state-helpers';
import type { MatchState, Rink, Skater } from './types';
import { alea, angDiff, clamp, pointSegDist } from './utils';

function planIA(rink: Rink, state: MatchState, s: Skater): void {
  const p = state.palet;
  const niv = state.nivEq[s.eq];
  const atk = butAttaque(rink, s.eq);
  const def = butDefendu(rink, s.eq);
  const dir = sensAttaque(s.eq);
  const cy = rink.cy;
  const ia = s.ia;
  const nous = equipe(state, s.eq);
  const eux = equipe(state, s.eq === 0 ? 1 : 0);

  if (s.tient) {
    const o = plusProche(eux, s.x, s.y);
    const dx = atk - s.x;
    const dy = cy - s.y;
    const d = Math.hypot(dx, dy);
    const devant = (atk - s.x) * dir > 14;
    const angleOk = Math.abs(dy) < Math.abs(dx) * 1.7;
    const bouche = eux.some((e) => pointSegDist(e.x, e.y, s.x, s.y, atk, cy) < 9 && Math.hypot(e.x - s.x, e.y - s.y) < d);
    const presse = eux.some((e) => Math.hypot(e.x - s.x, e.y - s.y) < 22);
    const tirable = devant && angleOk && d < niv.portee;
    // passer quand on est pressé ou qu'on n'a pas d'angle de tir
    if (!s.arme && nous.length > 1 && ((presse && Math.random() < 0.5) || (!tirable && Math.random() < 0.25) || (bouche && Math.random() < 0.35))) {
      const r = meilleurReceveur(state, s, s.eq, s.x, s.y, null);
      if (r && r.sc > 0) {
        passeVers(state, s, r.m, niv.err * 0.8);
        return;
      }
    }
    if (!s.arme && tirable && (!bouche || d < 55 || Math.random() < 0.2)) {
      s.arme = true;
      s.charge = 0;
      ia.but = clamp(0.2 + (d / niv.portee) * 0.65 + alea(-0.1, 0.2), 0.15, 1);
    }
    if (!devant) {
      ia.tx = atk - dir * 55;
      ia.ty = s.y < cy ? cy - 42 : cy + 42;
    } else {
      ia.tx = atk - dir * 50;
      ia.ty = cy + (s.y < cy ? -18 : 18);
      const oDevant = o && (o.x - s.x) * dir > 0 && Math.hypot(o.x - s.x, o.y - s.y) < 40;
      if (oDevant && o) {
        ia.ty = clamp(s.y + (s.y > o.y ? 38 : -38), rink.y + 16, rink.y + rink.h - 16);
        ia.tx = s.x + dir * 40;
        if (s.elanCd <= 0 && Math.random() < 0.3) {
          s.ex = dir;
          s.ey = s.y > o.y ? 0.6 : -0.6;
          elan(state, s, s.ex, s.ey);
        }
      }
    }
  } else if (p.passe && p.passe.vers === s) {
    // aller au-devant de la passe
    const v2 = p.vx * p.vx + p.vy * p.vy || 1;
    const t = clamp(((s.x - p.x) * p.vx + (s.y - p.y) * p.vy) / v2, 0, 0.8);
    ia.tx = p.x + p.vx * t;
    ia.ty = p.y + p.vy * t;
    ia.t = Math.min(ia.t, 0.08);
  } else if (p.porteur && p.porteur.eq !== s.eq) {
    if (!('face' in p.porteur)) {
      ia.tx = def + dir * rink.w * 0.3;
      ia.ty = cy + [0, -35, 35][s.rang]!;
    } else {
      const c = p.porteur;
      const actifs = nous.filter((m) => m.sonne <= 0);
      const presseur = plusProche(actifs.length ? actifs : nous, c.x, c.y);
      if (s === presseur) {
        const dDef = Math.abs(c.x - def);
        if (dDef < rink.w * 0.62 || Math.random() < 0.4) {
          ia.tx = c.x + c.vx * 0.22 + Math.cos(c.face) * 6;
          ia.ty = c.y + c.vy * 0.22 + Math.sin(c.face) * 6;
        } else {
          ia.tx = c.x + (def - c.x) * 0.3;
          ia.ty = c.y + (cy - c.y) * 0.3;
        }
        const dc = Math.hypot(c.x - s.x, c.y - s.y);
        if (dc < 26 && s.elanCd <= 0 && Math.random() < niv.check * niv.reac * 1.2) {
          elan(state, s, c.x + c.vx * 0.1 - s.x, c.y + c.vy * 0.1 - s.y);
        }
      } else {
        // marquage individuel : chacun prend l'adversaire libre le plus proche, côté but
        let libres = eux.filter((e) => e !== c);
        let cible: Skater | null = null;
        for (const m of nous.filter((m) => m !== presseur).sort((a, b) => a.rang - b.rang)) {
          const e = plusProche(libres, m.x, m.y);
          if (!e) break;
          libres = libres.filter((x) => x !== e);
          if (m === s) {
            cible = e;
            break;
          }
        }
        if (cible) {
          ia.tx = cible.x + (def - cible.x) * 0.2;
          ia.ty = cible.y + (cy - cible.y) * 0.2;
        } else {
          ia.tx = def + (c.x - def) * 0.35;
          ia.ty = cy + (c.y - cy) * 0.35;
        }
      }
    }
  } else if (p.porteur && p.porteur.eq === s.eq) {
    const c = p.porteur;
    if (!('face' in c)) {
      ia.tx = def + dir * rink.w * [0.3, 0.42, 0.42][s.rang]!;
      ia.ty = cy + [0, -40, 40][s.rang]!;
    } else {
      // soutien : un joueur dans l'enclave, l'autre en retrait pour la remise
      const soutiens = nous.filter((m) => m !== c).sort((a, b) => Math.abs(a.x - atk) - Math.abs(b.x - atk));
      const haut = c.y < cy ? 1 : -1;
      if (soutiens[0] === s) {
        ia.tx = atk - dir * 52;
        ia.ty = cy + haut * 22;
      } else {
        ia.tx = c.x - dir * 45;
        ia.ty = cy + haut * 34;
      }
      ia.tx += alea(-6, 6);
      ia.ty += alea(-6, 6);
    }
  } else {
    // palet libre : le plus proche fonce, les autres se placent
    const parDist = [...nous].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const k = parDist.indexOf(s);
    if (k === 0) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      const t = Math.min(0.6, d / 160);
      ia.tx = p.x + p.vx * t - dir * 4;
      ia.ty = p.y + p.vy * t;
    } else if (k === 1) {
      ia.tx = p.x + (atk - p.x) * 0.3;
      ia.ty = cy + (p.y < cy ? 26 : -26);
    } else {
      ia.tx = def + (p.x - def) * 0.4;
      ia.ty = cy + (p.y - cy) * 0.4;
    }
  }
  ia.tx = clamp(ia.tx, rink.x + 8, rink.x + rink.w - 8);
  ia.ty = clamp(ia.ty, rink.y + 8, rink.y + rink.h - 8);
}

export function pilotageIA(rink: Rink, state: MatchState, s: Skater, dt: number): void {
  const ia = s.ia;
  ia.t -= dt;
  if (ia.t <= 0) {
    ia.t = state.nivEq[s.eq].reac * alea(0.7, 1.3);
    planIA(rink, state, s);
  }
  // si on perd le palet en armant, on oublie le tir
  if (s.arme && !s.tient) {
    s.arme = false;
    s.charge = 0;
  }
  if (s.arme) {
    s.charge = Math.min(1, s.charge + dt / 0.85);
    if (s.charge >= ia.but) {
      const gardien = state.gardiens[s.eq === 0 ? 1 : 0];
      tir(state, rink, s, angleVersCoinLoin(rink, s.eq, s.x, s.y, gardien, state.nivEq[s.eq].err), s.charge);
    }
  }
  // pilotage : vitesse désirée moins vitesse actuelle
  const dx = ia.tx - s.x;
  const dy = ia.ty - s.y;
  const d = Math.hypot(dx, dy);
  const vmax = VMAX * s.vit;
  const vd = Math.min(1, d / 26) * vmax;
  const dvx = (d > 0 ? (dx / d) * vd : 0) - s.vx;
  const dvy = (d > 0 ? (dy / d) * vd : 0) - s.vy;
  const m = Math.hypot(dvx, dvy);
  const k = Math.min(1, m / (vmax * 0.35));
  s.ex = m > 0 ? (dvx / m) * k : 0;
  s.ey = m > 0 ? (dvy / m) * k : 0;
  if (d < 3 && Math.hypot(s.vx, s.vy) < 15) {
    s.ex = s.ey = 0;
  }
  // tourner la crosse vers le but quand on porte le palet
  if (s.tient && s.arme) {
    const a = Math.atan2(rink.cy - s.y, butAttaque(rink, s.eq) - s.x);
    s.face += clamp(angDiff(s.face, a), -8 * dt, 8 * dt);
  }
}
