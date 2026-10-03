import { describe, expect, it } from 'vitest';
import { prendPalet } from '../src/core/actions';
import { activePouvoir, DEF_POUVOIRS, majPouvoirs } from '../src/core/pouvoirs';
import { creePartie } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, encodeInstantane } from '../src/net/instantane';
import { EmetteurEntrees, EntreeDistante } from '../src/net/entrees';
import { INTENT_VIDE } from '../src/core/types';
import { donne, partie, passes, rink } from './aides-pouvoirs';

describe('bonus : lot 3', () => {
  /** Tir qui rentre dans la cage de droite (équipe 0), gardien écarté. */
  function marqueA0(st: MatchState): void {
    for (const s of st.patineurs) s.y = rink.cy + 60;
    st.gardiens[1].a = 1.3;
    st.gardiens[1].vit = 0;
    const p = st.palet;
    p.porteur = null;
    p.x = rink.butD - 12;
    p.y = rink.cy - 10;
    p.vx = 420;
    p.vy = 0;
    for (let i = 0; i < 30 && st.phase === 'jeu'; i++) pas(rink, st, 1 / 120);
  }

  it('un but met fin à tous les bonus des deux équipes, même à un tirage en cours', () => {
    const st = partie();
    donne(st, 1, 'inversion');
    activePouvoir(
      rink,
      st,
      1,
      st.patineurs.find((s) => s.eq === 1)!,
    );
    donne(st, 0, 'freeze');
    st.pouvoirs![0].tirage = 1;
    marqueA0(st);
    expect(st.score[0]).toBe(1);
    expect(st.pouvoirs![1].actif).toBeNull();
    expect(st.pouvoirs![0].pret).toBeNull();
    expect(st.pouvoirs![0].tirage).toBe(0);
  });

  it('surnombre : un renfort entre pour la durée du bonus, puis repart', () => {
    const st = partie();
    const n = st.patineurs.length;
    donne(st, 0, 'surnombre');
    activePouvoir(rink, st, 0, st.controles[0]);
    const renfort = st.patineurs.find((s) => s.renfort)!;
    expect(st.patineurs).toHaveLength(n + 1);
    expect(renfort.eq).toBe(0);
    // il joue : l'IA le fait patiner
    for (let i = 0; i < 120; i++) pas(rink, st, 1 / 120);
    expect(Math.hypot(renfort.vx, renfort.vy)).toBeGreaterThan(0);
    // on lui donne le palet et la main, puis le bonus se termine
    prendPalet(st, renfort);
    majPouvoirs(rink, st, DEF_POUVOIRS.surnombre.duree);
    expect(st.patineurs).toHaveLength(n);
    expect(st.palet.porteur).toBeNull();
    expect(st.controles[0]).not.toBe(renfort);
    expect(st.patineurs).toContain(st.controles[0]);
  });

  it('surnombre en Wi-Fi : le client ajoute puis retire le renfort', () => {
    const hote = partie();
    hote.humains = [true, true];
    const client = partie();
    donne(hote, 1, 'surnombre');
    activePouvoir(rink, hote, 1, hote.controles[1]);
    let inst = decodeInstantane(encodeInstantane(hote, rink, 1))!;
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.patineurs).toHaveLength(hote.patineurs.length);
    expect(client.patineurs.at(-1)!.renfort).toBe(true);
    expect(client.patineurs.at(-1)!.eq).toBe(1);
    majPouvoirs(rink, hote, DEF_POUVOIRS.surnombre.duree);
    inst = decodeInstantane(encodeInstantane(hote, rink, 2))!;
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.patineurs.some((s) => s.renfort)).toBe(false);
  });

  it('entraînement : pas de chrono, le bonus choisi revient après chaque usage, l’adversaire n’en a pas', () => {
    const st = creePartie(rink, {
      mode: 'match',
      niveauIdx: 1,
      dureeIdx: 1,
      effectifIdx: 1,
      entrainement: 'vitesse',
    });
    st.phase = 'jeu';
    const h0 = st.horloge;
    for (let i = 0; i < 240; i++) pas(rink, st, 1 / 120);
    expect(st.horloge).toBe(h0);
    // le bonus choisi part tout seul
    expect(st.pouvoirs![0].actif).toBe('vitesse');
    let fini = false;
    for (let i = 0; i < (DEF_POUVOIRS.vitesse.duree + 0.1) * 120 && !fini; i++) {
      majPouvoirs(rink, st, 1 / 120);
      fini = st.pouvoirs![0].actif === null;
    }
    expect(fini).toBe(true);
    // puis il revient peu après
    majPouvoirs(rink, st, 1);
    expect(st.pouvoirs![0].actif).toBe('vitesse');
    passes(st, 1, 10);
    expect(st.pouvoirs![1].pret).toBeNull();
  });
});

describe('bonus en Wi-Fi', () => {
  it('l’instantané transporte les bonus et la traînée du palet', () => {
    const st = partie();
    st.humains = [true, true];
    st.pouvoirs![0].passes = 2;
    donne(st, 1, 'inversion');
    st.pouvoirs![1].tirage = 0.5;
    st.pouvoirs![0].actif = 'double';
    st.pouvoirs![0].reste = 7.5;
    st.palet.lueur = 3;
    const inst = decodeInstantane(encodeInstantane(st, rink, 3))!;
    const client = partie();
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.pouvoirs![0].passes).toBe(2);
    expect(client.pouvoirs![0].actif).toBe('double');
    expect(client.pouvoirs![0].reste).toBeCloseTo(7.5, 1);
    expect(client.pouvoirs![1].pret).toBe('inversion');
    expect(client.pouvoirs![1].tirage).toBeCloseTo(0.5, 2);
    expect(client.palet.lueur).toBe(3);

    const sans = decodeInstantane(encodeInstantane(partie(false), rink, 4))!;
    expect(sans.pouvoirs).toBeNull();
  });

  it('plus de bouton BONUS : les entrées n’en portent plus, et l’appui sur ÉCHEC arrive une seule fois', () => {
    const em = new EmetteurEntrees();
    const hote = new EntreeDistante();
    hote.recoit(em.encode(INTENT_VIDE), 0);
    const p = em.encode({ ...INTENT_VIDE, elanAppui: true });
    hote.recoit(p, 0.01);
    hote.recoit(p, 0.02);
    const i = hote.prochain(0.02);
    expect(i.elanAppui).toBe(true);
    expect('bonusAppui' in i).toBe(false);
    expect(hote.prochain(0.03).elanAppui).toBe(false);
  });
});
