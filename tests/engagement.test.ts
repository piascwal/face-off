import { describe, expect, it } from 'vitest';
import { APPROCHE_S } from '../src/core/constants';
import { calculeRink } from '../src/core/rink';
import { creePartie, engagement } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, Skater } from '../src/core/types';

const rink = calculeRink(400, 200);
const partie = (): MatchState => creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
const miseAuJeu = (st: MatchState, eq: 0 | 1): Skater => st.patineurs.find((s) => s.eq === eq && s.rang === 0)!;
const ecart = (st: MatchState): number => Math.abs(miseAuJeu(st, 0).x - miseAuJeu(st, 1).x);

describe('engagement : les joueurs se rapprochent pour se mettre en position', () => {
  it('au début de l’engagement, les deux joueurs de la mise au jeu sont loin l’un de l’autre', () => {
    const st = partie();
    expect(st.phase).toBe('engagement');
    expect(ecart(st)).toBeGreaterThan(100);
    expect(st.approche).not.toBeNull();
  });

  it('ils se rapprochent sans jamais reculer, freinent, puis se font face à 40 px', () => {
    const st = partie();
    let precedent = ecart(st);
    let vitesseMax = 0;
    for (let i = 0; i < 120 * (APPROCHE_S + 0.2); i++) {
      pas(rink, st, 1 / 120);
      const e = ecart(st);
      expect(e).toBeLessThanOrEqual(precedent + 1e-6);
      precedent = e;
      vitesseMax = Math.max(vitesseMax, Math.hypot(miseAuJeu(st, 0).vx, miseAuJeu(st, 0).vy));
    }
    // l'arrivée est exacte, à l'arrêt, face à face
    expect(st.phase).toBe('engagement');
    expect(ecart(st)).toBeCloseTo(40, 3);
    for (const eq of [0, 1] as const) {
      const s = miseAuJeu(st, eq);
      expect(s.x).toBeCloseTo(rink.cx + (eq === 0 ? -20 : 20), 3);
      expect(Math.hypot(s.vx, s.vy)).toBe(0);
      expect(Math.cos(s.face) * (eq === 0 ? 1 : -1)).toBeGreaterThan(0.9);
    }
    expect(vitesseMax).toBeGreaterThan(30);
    expect(st.approche).toBeNull();
  });

  it('tous les coéquipiers arrivent à leur place de départ habituelle', () => {
    const st = partie();
    for (let i = 0; i < 120 * 1.1; i++) pas(rink, st, 1 / 120);
    for (const s of st.patineurs) {
      if (s.rang === 0) continue;
      expect(Math.abs(s.x - (rink.cx + (s.eq === 0 ? -44 : 44)))).toBeLessThan(0.01);
    }
  });

  it('l’animation se rejoue à chaque engagement (après un but, en prolongation)', () => {
    const st = partie();
    for (let i = 0; i < 120 * 2; i++) pas(rink, st, 1 / 120);
    expect(st.phase).toBe('jeu');
    engagement(rink, st, 1.3);
    expect(st.phase).toBe('engagement');
    expect(ecart(st)).toBeGreaterThan(100);
    for (let i = 0; i < 120 * 1.5 && st.phase === 'engagement'; i++) pas(rink, st, 1 / 120);
    expect(st.phase).toBe('jeu');
    // une prolongation (2,4 s) : l'approche dure toujours moins que l'engagement
    engagement(rink, st, 2.4);
    expect(st.approche!.duree).toBeLessThan(2.4);
  });

  it('le palet reste au centre pendant toute l’approche', () => {
    const st = partie();
    for (let i = 0; i < 60; i++) {
      pas(rink, st, 1 / 120);
      expect(st.palet.x).toBe(rink.cx);
      expect(st.palet.y).toBe(rink.cy);
    }
  });
});
