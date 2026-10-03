import { describe, expect, it } from 'vitest';
import { prendPalet } from '../src/core/actions';
import {
  activePouvoir,
  comptePasse,
  DEF_POUVOIRS,
  majPouvoirs,
  POIDS_POUVOIRS,
  POUVOIRS,
  pouvoirPret,
  SEUIL_PASSES,
  TIRAGE_S,
  tirePouvoir,
} from '../src/core/pouvoirs';
import { engagement } from '../src/core/rules';
import type { PouvoirId } from '../src/core/types';
import { donne, partie, passes, rink } from './aides-pouvoirs';

describe('bonus : jauge de passes et tirage', () => {
  it('4 passes réussies débloquent un bonus tiré au sort, qui part tout seul à la fin du tirage', () => {
    const st = partie();
    passes(st, 0, SEUIL_PASSES - 1);
    expect(st.pouvoirs![0].passes).toBe(SEUIL_PASSES - 1);
    expect(st.pouvoirs![0].pret).toBeNull();
    passes(st, 0, 1);
    const pv = st.pouvoirs![0];
    expect(pv.pret).not.toBeNull();
    expect(DEF_POUVOIRS[pv.pret!].dispo).toBe(true);
    expect(pv.passes).toBe(0);
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'tirage')).toBe(true);
    // à la 4e passe : le gros « BONUS » doré, sans la bulle de combo
    const bulles = st.evenements.filter((e) => e.type === 'bulle');
    expect(bulles.at(-1)).toMatchObject({ txt: 'BONUS', gros: true });
    expect(bulles.some((e) => e.type === 'bulle' && e.txt === `COMBO x${SEUIL_PASSES}`)).toBe(false);
    // pendant le tirage, il ne part pas encore
    majPouvoirs(rink, st, TIRAGE_S - 0.1);
    expect(pv.actif).toBeNull();
    expect(pouvoirPret(st, 0)).toBe(false);
    majPouvoirs(rink, st, 0.11);
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'active')).toBe(true);
    expect(pv.actif).not.toBeNull();
    expect(pv.reste).toBe(DEF_POUVOIRS[pv.actif!].duree);
    // le joueur piloté devient doré
    if (DEF_POUVOIRS[pv.actif!].dore) expect(pv.dore).toBe(st.controles[0]!.rang);
    expect(pv.pret).toBeNull();
    // le prochain bonus demande toujours le même nombre de passes
    expect(pv.seuil).toBe(SEUIL_PASSES);
  });

  it('les passes ne comptent pas tant qu’un bonus est en main ou en cours', () => {
    const st = partie();
    donne(st, 0, 'vitesse');
    passes(st, 0, 5);
    expect(st.pouvoirs![0].passes).toBe(0);
    activePouvoir(rink, st, 0, st.controles[0]);
    passes(st, 0, 5);
    expect(st.pouvoirs![0].passes).toBe(0);
  });

  it('la série retombe à zéro sur une interception, un arrêt du gardien ou une remise en jeu', () => {
    const st = partie();
    passes(st, 0, 2);
    const adverse = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, adverse);
    expect(st.pouvoirs![0].passes).toBe(0);

    passes(st, 0, 2);
    passes(st, 1, 2);
    prendPalet(st, st.gardiens[0]);
    expect(st.pouvoirs![0].passes).toBe(0);
    expect(st.pouvoirs![1].passes).toBe(0);

    passes(st, 1, 2);
    engagement(rink, st, 1);
    expect(st.pouvoirs![1].passes).toBe(0);
  });

  it('un bonus tiré hors du jeu (engagement, ralenti) attend la reprise pour partir', () => {
    const st = partie();
    donne(st, 0, 'vitesse');
    st.phase = 'engagement';
    majPouvoirs(rink, st, 5);
    expect(st.pouvoirs![0].actif).toBeNull();
    expect(st.pouvoirs![0].pret).toBe('vitesse');
    st.phase = 'jeu';
    majPouvoirs(rink, st, 1 / 120);
    expect(st.pouvoirs![0].actif).toBe('vitesse');
    expect(st.pouvoirs![0].pret).toBeNull();
  });

  it('chaque bonus a une durée limitée (10 s au plus), même le but x2', () => {
    for (const id of POUVOIRS) {
      expect(Number.isFinite(DEF_POUVOIRS[id].duree)).toBe(true);
      expect(DEF_POUVOIRS[id].duree).toBeLessThanOrEqual(10);
    }
    expect(DEF_POUVOIRS.double.duree).toBe(10);
    const st = partie();
    donne(st, 0, 'double');
    majPouvoirs(rink, st, 1 / 120);
    expect(st.pouvoirs![0].actif).toBe('double');
    majPouvoirs(rink, st, 10);
    expect(st.pouvoirs![0].actif).toBeNull();
  });

  it('tirage pondéré : seuls les bonus déjà en jeu sortent, selon leur poids (super héros deux fois plus rare)', () => {
    const st = partie();
    const dispo = POUVOIRS.filter((id) => DEF_POUVOIRS[id].dispo);
    const total = dispo.reduce((t, id) => t + POIDS_POUVOIRS[id], 0);
    const compte = new Map<PouvoirId, number>();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const id = tirePouvoir(st, 0, (i + 0.5) / N);
      compte.set(id, (compte.get(id) ?? 0) + 1);
    }
    expect([...compte.keys()].sort()).toEqual([...dispo].sort());
    for (const [id, n] of compte)
      expect(Math.abs(n - (N * POIDS_POUVOIRS[id]) / total)).toBeLessThanOrEqual(2);
    expect(POIDS_POUVOIRS.heros).toBe(POIDS_POUVOIRS.vitesse / 2);
  });

  it('bonus désactivés : pas de jauge, rien ne se passe', () => {
    const st = partie(false);
    expect(st.pouvoirs).toBeNull();
    passes(st, 0, 6);
    comptePasse(st, 0, st.patineurs[0]!);
    expect(st.evenements.some((e) => e.type === 'pouvoir')).toBe(false);
  });

  it('la durée d’un bonus ne s’écoule que pendant le jeu', () => {
    const st = partie();
    donne(st, 0, 'vitesse');
    activePouvoir(rink, st, 0, st.controles[0]);
    st.phase = 'but';
    majPouvoirs(rink, st, 10);
    expect(st.pouvoirs![0].actif).toBe('vitesse');
    st.phase = 'jeu';
    majPouvoirs(rink, st, DEF_POUVOIRS.vitesse.duree + 0.1);
    expect(st.pouvoirs![0].actif).toBeNull();
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'fin')).toBe(true);
  });
});
