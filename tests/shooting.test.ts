import { describe, expect, it } from 'vitest';
import { calculeRink } from '../src/core/rink';
import { qualiteDirection, qualiteDuTir, rayonGardienEffectif, seuilRattrapeEffectif } from '../src/core/shooting';
import { nouveauGardien } from '../src/core/entities';
import { BUT_DEMI } from '../src/core/constants';

describe('qualité de tir → probabilité de but', () => {
  const rink = calculeRink(400, 200);

  it('vaut 0 pour un tir qui part hors du cadre', () => {
    const gardien = nouveauGardien(1);
    gardien.x = rink.butD;
    gardien.y = rink.cy;
    // tir qui vise bien au-dessus de la cage (hors cadre)
    const ang = Math.atan2(rink.cy - 200 - rink.cy, rink.butD - rink.cx);
    expect(qualiteDirection(rink, 0, rink.cx, rink.cy, ang, gardien)).toBe(0);
  });

  it('vaut 0 pour un tir qui ne va pas du tout vers la cage adverse', () => {
    const gardien = nouveauGardien(1);
    gardien.x = rink.butD;
    gardien.y = rink.cy;
    // tir tiré vers sa propre cage (mauvaise direction pour l'équipe 0)
    expect(qualiteDirection(rink, 0, rink.cx, rink.cy, Math.PI, gardien)).toBe(0);
  });

  it('augmente quand on vise plus loin de la position du gardien', () => {
    const gardien = nouveauGardien(1);
    gardien.x = rink.butD;
    gardien.y = rink.cy; // gardien au centre de sa cage

    const versGardien = Math.atan2(rink.cy - rink.cy, rink.butD - rink.cx);
    const versCoinHaut = Math.atan2(rink.cy - (BUT_DEMI - 4) - rink.cy, rink.butD - rink.cx);

    const qCentre = qualiteDirection(rink, 0, rink.cx, rink.cy, versGardien, gardien);
    const qCoin = qualiteDirection(rink, 0, rink.cx, rink.cy, versCoinHaut, gardien);

    expect(qCoin).toBeGreaterThan(qCentre);
  });

  it('la qualité globale augmente avec la puissance à direction égale', () => {
    const gardien = nouveauGardien(1);
    gardien.x = rink.butD;
    gardien.y = rink.cy;
    const ang = Math.atan2(rink.cy - (BUT_DEMI - 4) - rink.cy, rink.butD - rink.cx);

    const qFaible = qualiteDuTir(rink, 0, rink.cx, rink.cy, ang, 0.2, gardien);
    const qForte = qualiteDuTir(rink, 0, rink.cx, rink.cy, ang, 0.9, gardien);

    expect(qForte).toBeGreaterThan(qFaible);
  });

  it("n'est jamais un but garanti même au maximum (le gardien garde une chance)", () => {
    const gardien = nouveauGardien(1);
    gardien.x = rink.butD;
    gardien.y = rink.cy;
    const ang = Math.atan2(rink.cy - (BUT_DEMI - 0.1) - rink.cy, rink.butD - rink.cx);
    const q = qualiteDuTir(rink, 0, rink.cx, rink.cy, ang, 1, gardien);
    expect(q).toBeLessThan(1);
    expect(q).toBeLessThanOrEqual(0.92);
  });

  it('réduit le rayon effectif et le seuil de capture du gardien en proportion de la qualité', () => {
    const gardien = nouveauGardien(1);
    expect(rayonGardienEffectif(gardien, 0)).toBeCloseTo(gardien.r);
    expect(rayonGardienEffectif(gardien, 1)).toBeLessThan(rayonGardienEffectif(gardien, 0));
    expect(seuilRattrapeEffectif(0)).toBeGreaterThan(seuilRattrapeEffectif(1));
  });
});

describe('geste de tir', () => {
  it('un tir lance le geste (descente, impact, accompagnement), qui s’écoule puis s’arrête', async () => {
    const { creePartie } = await import('../src/core/rules');
    const { tir } = await import('../src/core/actions');
    const { pas } = await import('../src/core/simulation');
    const { TIR_ANIM_S } = await import('../src/core/constants');
    const rink = calculeRink(400, 200);
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
    st.phase = 'jeu';
    const s = st.controles[0]!;
    s.tient = true;
    st.palet.porteur = s;
    tir(st, rink, s, 0, 0.5);
    expect(s.tirT).toBeCloseTo(TIR_ANIM_S, 5);
    for (let i = 0; i < 24; i++) pas(rink, st, 1 / 120);
    expect(s.tirT).toBeGreaterThan(0);
    expect(s.tirT).toBeLessThan(TIR_ANIM_S);
    for (let i = 0; i < 60; i++) pas(rink, st, 1 / 120);
    expect(s.tirT).toBe(0);
  });
});

describe('mise en échec', () => {
  it('le choc fige, secoue, et émet l’onde et les étincelles d’impact', async () => {
    const { creePartie } = await import('../src/core/rules');
    const { elan } = await import('../src/core/actions');
    const { collisionsPatineurs } = await import('../src/core/physics');
    const rink = calculeRink(400, 200);
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
    st.phase = 'jeu';
    const s = st.controles[0]!;
    const o = st.patineurs.find((x) => x.eq === 1)!;
    for (const x of st.patineurs) x.tient = false;
    Object.assign(s, { x: 200, y: 100, vx: 0, vy: 0, elanCd: 0, sonne: 0 });
    Object.assign(o, { x: 207, y: 100, vx: 0, vy: 0, sonne: 0, esquiveT: 0, prepaEchecT: 0 });
    elan(st, s, 1, 0);
    expect(s.elanT).toBeGreaterThan(0);
    st.evenements.length = 0;
    collisionsPatineurs(st);
    const types = st.evenements.map((e) => e.type);
    expect(types).toContain('charge');
    expect(types).toContain('onde');
    expect(types.filter((t) => t === 'etincelles').length).toBe(2);
    expect(st.stats.checks[s.eq]).toBe(1);
    expect(s.elanT).toBe(0);
    expect(o.sonne).toBeGreaterThan(0);
  });
});
