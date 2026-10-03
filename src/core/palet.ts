/** Le palet : glisse, rebonds, filet, buts (et leurs conséquences), récupérations et interceptions. */

import { lachePalet, pointCrosse, prendPalet } from './actions';
import {
  ANNONCE_BUT_S,
  BUT_PROF,
  INTERCEPTION_RAYON,
  PASSE_AIMANT,
  PASSE_FACILE_MARGE,
  RECEPTION_RAYON,
} from './constants';
import {
  BLACKOUT_INTERCEPTION,
  BLACKOUT_VOL,
  cassePasses,
  dansLeNoir,
  DEF_POUVOIRS,
  demiCage,
  ENDORMI_RAYON,
  estGele,
  finPouvoir,
  superPasse,
  SUPER_PASSE_PORTEE,
  SUPER_PASSE_VITESSE,
  gardienEndormi,
  pouvoirActif,
  renversePuissant,
} from './pouvoirs';
import { rayonGardienEffectif, seuilRattrapeEffectif } from './shooting';
import type { MatchState, Puck, Rink, Skater } from './types';
import { alea, clamp } from './utils';
import { heurteBande, heurteSegment, type SegmentCage } from './collisions';

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
      // super passe : le palet se dirige vers le receveur sur tout le trajet, sans jamais ralentir sous un seuil
      const guide = superPasse(state, rec.eq);
      if ((guide || d < PASSE_AIMANT) && d > 0.5 && v > 20) {
        const k = Math.min(1, (guide ? 14 : 6) * dt);
        const cible = guide ? Math.max(v, SUPER_PASSE_VITESSE) : v;
        p.vx += ((dx / d) * cible - p.vx) * k;
        p.vy += ((dy / d) * cible - p.vy) * k;
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
    // la cage géante ou mini reste le temps du but (célébration et ralenti : on voit où le palet est entré),
    // elle est coupée à l'engagement suivant
    const actif = state.pouvoirs?.[e].actif;
    if (actif !== 'geante' && actif !== 'minicage') finPouvoir(state, e);
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
      // super passe : le receveur capte de plus loin, l'adversaire ne peut plus intercepter
      const guide = !!p.passe && superPasse(state, p.passe.vers.eq);
      const portee = !p.passe
        ? 7
        : visee
          ? RECEPTION_RAYON + marge + (guide ? SUPER_PASSE_PORTEE : 0)
          : s.eq === p.passe.vers.eq
            ? 7
            : guide
              ? 0
              : (INTERCEPTION_RAYON - marge) * noir;
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
