import { describe, expect, it } from 'vitest';
import { lancePasse, passeVers, pointCrosse, prendPalet } from '../src/core/actions';
import { PASSE_PRECISION } from '../src/core/constants';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type MatchState, type Skater } from '../src/core/types';

const rink = calculeRink(400, 200);

/** Deux coéquipiers de l'équipe 0 (pilotée par le joueur), tous les autres loin et immobiles. */
function situation(): { st: MatchState; a: Skater; b: Skater } {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  st.phase = 'jeu';
  for (const s of st.patineurs) Object.assign(s, { x: rink.cx - 150, y: rink.cy + 80, vx: 0, vy: 0 });
  const [a, b] = st.patineurs.filter((s) => s.eq === 0) as [Skater, Skater];
  Object.assign(a, { x: rink.cx - 70, y: rink.cy, face: 0 });
  Object.assign(b, { x: rink.cx + 40, y: rink.cy, face: 0 });
  for (const s of st.patineurs) Object.assign(s.ia, { t: 99, tx: s.x, ty: s.y });
  return { st, a, b };
}

/**
 * Passe parfaite de a vers b ; le joueur, qui a la main sur b dès le départ
 * de la passe, pousse le joystick (ix, iy) pendant `duree` secondes puis
 * lâche. Le palet arrive-t-il à b ?
 */
function recue(ix: number, iy: number, duree: number): boolean {
  const { st, a, b } = situation();
  prendPalet(st, a);
  passeVers(st, a, b, 0);
  let t = 0;
  const entree = (eq: number) => (eq === 0 && t < duree ? { ...INTENT_VIDE, ix, iy } : INTENT_VIDE);
  for (let i = 0; i < 90 && !st.palet.porteur; i++) {
    pas(rink, st, 1 / 60, entree);
    t += 1 / 60;
  }
  return st.palet.porteur === b;
}

describe('passe : le receveur peut s’élancer après le départ', () => {
  it('immobile, il la reçoit', () => {
    expect(recue(0, 0, 0)).toBe(true);
  });

  it('il démarre sa course juste après le départ : il la reçoit quand même (avant : manquée dès 12 px de décalage)', () => {
    expect(recue(0, 1, 0.08)).toBe(true);
    expect(recue(0, 1, 0.16)).toBe(true);
    expect(recue(0, -1, 0.16)).toBe(true);
    expect(recue(0.7, 0.7, 0.2)).toBe(true);
  });

  it('il continue de s’éloigner : la passe n’est pas téléguidée, elle le manque', () => {
    expect(recue(0, 1, 0.7)).toBe(false);
    expect(recue(0, -1, 0.7)).toBe(false);
  });

  it('le suivi ne corrige pas l’imprécision : une passe ratée au départ reste ratée', () => {
    const { st, a, b } = situation();
    prendPalet(st, a);
    // départ volontairement à côté (≈ 0,35 rad), receveur immobile
    const sp = pointCrosse(a);
    lancePasse(st, sp.x, sp.y, b, 0);
    const v = Math.hypot(st.palet.vx, st.palet.vy);
    const ang = Math.atan2(st.palet.vy, st.palet.vx) + 0.35;
    st.palet.vx = Math.cos(ang) * v;
    st.palet.vy = Math.sin(ang) * v;
    st.palet.passe!.trajet!.vise = { x: sp.x + Math.cos(ang) * 100, y: sp.y + Math.sin(ang) * 100 };
    for (let i = 0; i < 90 && !st.palet.porteur; i++) pas(rink, st, 1 / 60);
    expect(st.palet.porteur).not.toBe(b);
  });

  it('précision de base des passes resserrée', () => {
    expect(PASSE_PRECISION).toBeLessThan(1);
  });
});
