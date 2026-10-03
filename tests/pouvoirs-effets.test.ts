import { describe, expect, it, vi } from 'vitest';
import { coupDeCrosse, passeVers, pointCrosse, prendPalet, tir } from '../src/core/actions';
import {
  bougePatineur,
  collisionsPatineurs,
  majPalet,
  recuperations,
  segmentsCage,
} from '../src/core/physics';
import { activePouvoir, boutonBonus, majPouvoirs } from '../src/core/pouvoirs';
import { pas } from '../src/core/simulation';
import type { TeamId } from '../src/core/types';
import { INTENT_VIDE } from '../src/core/types';
import { donne, partie, rink } from './aides-pouvoirs';

describe('bonus : effets', () => {
  it('super vitesse : le joueur doré va nettement plus vite', () => {
    const vitesse = (avecBonus: boolean) => {
      const st = partie();
      const s = st.controles[0]!;
      if (avecBonus) {
        donne(st, 0, 'vitesse');
        activePouvoir(rink, st, 0, s);
      }
      s.x = rink.cx - 100;
      s.y = rink.cy;
      s.vx = s.vy = 0;
      s.ex = 1;
      const segs = segmentsCage(rink, true);
      for (let i = 0; i < 60; i++) bougePatineur(rink, st, s, 1 / 120, segs);
      return Math.hypot(s.vx, s.vy);
    };
    expect(vitesse(true)).toBeGreaterThan(vitesse(false) * 1.3);
  });

  it('but x2 : le but compte double, puis le bonus est consommé', () => {
    const st = partie();
    donne(st, 0, 'double');
    activePouvoir(rink, st, 0, st.controles[0]);
    for (const s of st.patineurs) s.y = rink.cy + 60;
    // gardien figé tout en bas de sa cage : le tir rentre en haut
    st.gardiens[1].a = 1.3;
    st.gardiens[1].vit = 0;
    const p = st.palet;
    p.porteur = null;
    p.x = rink.butD - 12;
    p.y = rink.cy - 10;
    p.vx = 420;
    p.vy = 0;
    for (let i = 0; i < 30 && st.phase === 'jeu'; i++) pas(rink, st, 1 / 120);
    expect(st.score[0]).toBe(2);
    expect(st.pouvoirs![0].actif).toBeNull();
  });

  it('full esquive : une mise en échec contre l’équipe glisse en esquive', () => {
    const st = partie();
    donne(st, 0, 'savon');
    activePouvoir(rink, st, 0, st.controles[0]);
    const cible = st.controles[0]!;
    const attaquant = st.patineurs.find((s) => s.eq === 1)!;
    cible.x = rink.cx;
    cible.y = rink.cy;
    attaquant.x = rink.cx - 8;
    attaquant.y = rink.cy;
    attaquant.elanT = 0.2;
    attaquant.vx = 200;
    collisionsPatineurs(st);
    expect(cible.sonne).toBe(0);
    expect(cible.esquiveT).toBeGreaterThan(0);
    expect(attaquant.sonne).toBeGreaterThan(0);
  });

  it('full esquive : le coup de crosse, lui, prend toujours le palet', () => {
    const st = partie();
    donne(st, 0, 'savon');
    activePouvoir(rink, st, 0, st.controles[0]);
    const porteur = st.controles[0]!;
    const voleur = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, porteur);
    // crosse contre crosse : le porteur regarde à droite, le voleur à gauche, face à face
    Object.assign(porteur, { x: rink.cx, y: rink.cy, face: 0, vx: 0, vy: 0 });
    Object.assign(voleur, {
      x: rink.cx + 16,
      y: rink.cy,
      face: Math.PI,
      vx: 0,
      vy: 0,
      pokeT: -10,
      recupCd: 0,
    });
    coupDeCrosse(st, voleur);
    const hasard = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      st.palet.x = pointCrosse(porteur).x;
      st.palet.y = pointCrosse(porteur).y;
      recuperations(st, 1 / 120);
    } finally {
      hasard.mockRestore();
    }
    expect(st.palet.porteur).toBeNull();
    expect(st.palet.dernier).toBe(voleur);
  });

  it('l’ordinateur reçoit son bonus tout seul : le porteur du palet devient doré', () => {
    const st = partie();
    donne(st, 1, 'vitesse');
    const porteur = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, porteur);
    majPouvoirs(rink, st, 1 / 120);
    expect(st.pouvoirs![1].actif).toBe('vitesse');
    expect(st.pouvoirs![1].dore).toBe(porteur.rang);
  });

  it('tir surpuissant en cours : le bouton TIR passe en or pour l’équipe, pas pour l’adversaire', () => {
    const st = partie();
    expect(boutonBonus(st, 0)).toBeNull();
    donne(st, 0, 'puissant');
    majPouvoirs(rink, st, 1 / 120);
    expect(boutonBonus(st, 0)).toBe('tir');
    expect(boutonBonus(st, 1)).toBeNull();
    donne(st, 1, 'vitesse');
    majPouvoirs(rink, st, 1 / 120);
    expect(boutonBonus(st, 1)).toBeNull();
  });
});

describe('bonus : lot 2', () => {
  it('tir surpuissant : palet plus rapide, adversaire sur la trajectoire renversé, palet qui le traverse', () => {
    const vitesseTir = (avecBonus: boolean) => {
      const st = partie();
      const s = st.controles[0]!;
      for (const o of st.patineurs) if (o !== s) o.y = rink.y + 10;
      s.x = rink.cx - 80;
      s.y = rink.cy;
      s.vx = s.vy = 0;
      s.tient = true;
      st.palet.porteur = s;
      if (avecBonus) {
        donne(st, 0, 'puissant');
        activePouvoir(rink, st, 0, s);
      }
      // un adversaire planté sur la route du tir
      const cible = st.patineurs.find((o) => o.eq === 1)!;
      cible.x = rink.cx - 20;
      cible.y = rink.cy + 1;
      tir(st, rink, s, 0, 0.6);
      const v0 = Math.hypot(st.palet.vx, st.palet.vy);
      const segs = segmentsCage(rink, false);
      for (let i = 0; i < 60; i++) majPalet(rink, st, 1 / 240, segs);
      return { st, v0, cible };
    };
    const normal = vitesseTir(false);
    const fort = vitesseTir(true);
    expect(fort.v0).toBeGreaterThan(normal.v0 * 1.4);
    expect(fort.st.pouvoirs![0].actif).toBeNull();
    expect(fort.cible.chuteT).toBeGreaterThan(1.5);
    expect(fort.st.palet.x).toBeGreaterThan(fort.cible.x + 10);
    expect(normal.cible.chuteT).toBe(0);
  });

  it('freeze : tout le monde est figé sauf le joueur doré, qui garde la main', () => {
    const st = partie();
    st.humains = [true, false];
    const moi = st.controles[0]!;
    donne(st, 0, 'freeze');
    activePouvoir(rink, st, 0, moi);
    for (const s of st.patineurs) {
      s.vx = 50;
      s.vy = 0;
    }
    const avant = st.patineurs.map((s) => s.x);
    for (let i = 0; i < 60; i++) pas(rink, st, 1 / 120, () => ({ ...INTENT_VIDE, ix: 1 }));
    st.patineurs.forEach((s, i) => {
      if (s === moi) expect(s.x).toBeGreaterThan(avant[i]! + 5);
      else expect(s.x).toBeCloseTo(avant[i]!, 5);
    });
    // pas de changement de joueur pendant le freeze de son équipe
    const autre = st.patineurs.find((s) => s.eq === 0 && s !== moi)!;
    passeVers(st, moi, autre);
    expect(st.controles[0]).toBe(moi);
  });

  it('inversion : les déplacements de l’équipe adverse partent à l’envers', () => {
    const st = partie();
    st.humains = [true, true];
    for (const eq of [0, 1] as TeamId[]) {
      const s = st.patineurs.find((o) => o.eq === eq)!;
      if (st.controles[eq] !== s) prendPalet(st, s);
    }
    donne(st, 0, 'inversion');
    activePouvoir(rink, st, 0, st.controles[0]);
    pas(rink, st, 1 / 120, () => ({ ...INTENT_VIDE, ix: 1 }));
    expect(st.controles[0]!.ex).toBe(1);
    expect(st.controles[1]!.ex).toBe(-1);
  });
});
