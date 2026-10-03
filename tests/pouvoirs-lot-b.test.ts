import { describe, expect, it } from 'vitest';
import { prendPalet, tir } from '../src/core/actions';
import { BUT_DEMI } from '../src/core/constants';
import { majGardien, majPalet, segmentsCage } from '../src/core/physics';
import {
  BLACKOUT_INTERCEPTION,
  BLACKOUT_VOL,
  boutonBonus,
  CAGE_GEANTE,
  dansLeNoir,
  demiCage,
  effetActif,
  estGele,
  gardienEndormi,
  HEROS_FREEZE_S,
  joueurDore,
  TREMBLEMENT_CHUTE,
  DEF_POUVOIRS,
  majPouvoirs,
} from '../src/core/pouvoirs';
import { pas } from '../src/core/simulation';
import type { MatchState, PouvoirId, TeamId } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';
import { donne, partie, rink } from './aides-pouvoirs';

describe('bonus : lot B', () => {
  /** Le bonus `id` part pour l'équipe `eq` (fin du tirage pendant le jeu). */
  function lance(st: MatchState, eq: TeamId, id: PouvoirId): void {
    donne(st, eq, id);
    majPouvoirs(rink, st, 1 / 120);
    expect(st.pouvoirs![eq].actif).toBe(id);
  }

  it('super héros : vitesse, freeze des premières secondes, et un tir surpuissant qui ne coupe pas le reste', () => {
    const st = partie();
    st.humains = [true, false];
    const moi = st.controles[0]!;
    lance(st, 0, 'heros');
    expect(effetActif(st, 0, 'vitesse')).toBe(true);
    expect(effetActif(st, 0, 'freeze')).toBe(true);
    expect(effetActif(st, 0, 'puissant')).toBe(true);
    expect(boutonBonus(st, 0)).toBe('tir');
    const adverse = st.patineurs.find((s) => s.eq === 1)!;
    expect(estGele(st, adverse)).toBe(true);
    expect(estGele(st, moi)).toBe(false);
    // le tir surpuissant part, le reste du bonus continue
    moi.tient = true;
    st.palet.porteur = moi;
    tir(st, rink, moi, 0, 0.6);
    expect(st.palet.puissant).toBe(true);
    expect(st.pouvoirs![0].actif).toBe('heros');
    expect(effetActif(st, 0, 'puissant')).toBe(false);
    expect(boutonBonus(st, 0)).toBeNull();
    // après HEROS_FREEZE_S, les adversaires se dégèlent ; la vitesse reste
    majPouvoirs(rink, st, HEROS_FREEZE_S + 0.05);
    expect(estGele(st, adverse)).toBe(false);
    expect(effetActif(st, 0, 'vitesse')).toBe(true);
  });

  it('tremblement : tout le monde tombe sauf le porteur du palet, coéquipiers compris', () => {
    const st = partie();
    const porteur = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, porteur);
    lance(st, 0, 'tremblement');
    for (const s of st.patineurs) {
      if (s === porteur) expect(s.chuteT).toBe(0);
      else expect(s.chuteT).toBeCloseTo(TREMBLEMENT_CHUTE, 5);
    }
    expect(st.evenements.some((e) => e.type === 'secousse' && e.force >= 5)).toBe(true);
  });

  it('cage géante : la cage adverse double, le gardien garde sa taille ; un tir dans le coin élargi rentre', () => {
    const st = partie();
    lance(st, 0, 'geante');
    expect(demiCage(st, 1)).toBe(BUT_DEMI * CAGE_GEANTE);
    expect(demiCage(st, 0)).toBe(BUT_DEMI);
    // le gardien ne sort pas de sa zone habituelle, même face à un palet tout au coin
    st.palet.porteur = null;
    st.palet.x = rink.butD - 30;
    st.palet.y = rink.cy + BUT_DEMI * CAGE_GEANTE;
    for (let i = 0; i < 120; i++) majGardien(rink, st, st.gardiens[1], 1 / 120);
    expect(Math.abs(st.gardiens[1].y - rink.cy)).toBeLessThan(BUT_DEMI);
    for (const s of st.patineurs) s.y = rink.cy + 80;
    const p = st.palet;
    p.porteur = null;
    p.x = rink.butD - 12;
    // là où il n'y avait que le poteau : dans la partie élargie, loin du gardien
    st.gardiens[1].a = -1.3;
    st.gardiens[1].vit = 0;
    p.y = rink.cy + BUT_DEMI * CAGE_GEANTE - 5;
    p.vx = 420;
    p.vy = 0;
    for (let i = 0; i < 30 && st.phase === 'jeu'; i++) pas(rink, st, 1 / 120);
    expect(st.score[0]).toBe(1);
    // la cage reste géante pendant tout le but (célébration, ralenti), puis reprend sa taille à l'engagement
    expect(st.phase).toBe('but');
    expect(demiCage(st, 1)).toBe(BUT_DEMI * CAGE_GEANTE);
    for (let i = 0; i < 120 * 6 && st.phase === 'but'; i++) pas(rink, st, 1 / 120);
    expect(st.phase).toBe('engagement');
    expect(demiCage(st, 1)).toBe(BUT_DEMI);
    expect(st.pouvoirs![0].actif).toBeNull();
  });

  it('mini cage : sa propre cage rétrécit, un tir à côté ne rentre plus', () => {
    const st = partie();
    lance(st, 1, 'minicage');
    expect(demiCage(st, 1)).toBeLessThan(BUT_DEMI / 2 + 1);
    for (const s of st.patineurs) s.y = rink.cy + 80;
    st.gardiens[1].a = -1.3;
    st.gardiens[1].vit = 0;
    const p = st.palet;
    p.porteur = null;
    p.x = rink.butD - 12;
    p.y = rink.cy + BUT_DEMI - 4;
    p.vx = 420;
    p.vy = 0;
    for (let i = 0; i < 30; i++) pas(rink, st, 1 / 120);
    expect(st.score[0]).toBe(0);
  });

  it('gardien endormi : il ne bouge plus et n’attrape plus le palet', () => {
    const st = partie();
    lance(st, 0, 'endormi');
    const gk = st.gardiens[1];
    expect(gardienEndormi(st, 1)).toBe(true);
    expect(gardienEndormi(st, 0)).toBe(false);
    const a0 = gk.a;
    st.palet.porteur = null;
    st.palet.x = rink.butD - 40;
    st.palet.y = rink.cy - 30;
    for (let i = 0; i < 60; i++) majGardien(rink, st, gk, 1 / 120);
    expect(gk.a).toBe(a0);
    // un palet lent sur lui : il ne le bloque pas pour le garder
    st.palet.x = gk.x - 6;
    st.palet.y = gk.y;
    st.palet.vx = 30;
    st.palet.vy = 0;
    for (let i = 0; i < 10; i++) majPalet(rink, st, 1 / 240, segmentsCage(rink, false));
    expect(st.palet.porteur).not.toBe(gk);
  });

  it('blackout : l’équipe dans le noir intercepte moins bien et vole moins de palets', () => {
    const st = partie();
    lance(st, 0, 'blackout');
    expect(dansLeNoir(st, 1)).toBe(true);
    expect(dansLeNoir(st, 0)).toBe(false);
    expect(BLACKOUT_INTERCEPTION).toBeLessThan(1);
    expect(BLACKOUT_VOL).toBeLessThan(1);
    // joueur doré : celui qu'on pilote, sous le projecteur
    expect(joueurDore(st, 0)).toBe(st.controles[0]);
  });

  it('givre : un bonus d’écran seulement, qui finit au bout de sa durée', () => {
    const st = partie();
    lance(st, 1, 'givre');
    majPouvoirs(rink, st, DEF_POUVOIRS.givre.duree + 0.01);
    expect(st.pouvoirs![1].actif).toBeNull();
  });

  it('Wi-Fi : le tir déjà fait du super héros voyage dans l’instantané', () => {
    const st = partie();
    st.humains = [true, true];
    lance(st, 1, 'heros');
    st.pouvoirs![1].tirFait = true;
    const inst = decodeInstantane(encodeInstantane(st, rink, 5))!;
    const client = partie();
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.pouvoirs![1].actif).toBe('heros');
    expect(client.pouvoirs![1].tirFait).toBe(true);
    expect(effetActif(client, 1, 'puissant')).toBe(false);
  });
});
