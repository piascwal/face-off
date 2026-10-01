import { describe, expect, it } from 'vitest';
import { passeVers, prendPalet, tir } from '../src/core/actions';
import { bougePatineur, collisionsPatineurs, majPalet, segmentsCage } from '../src/core/physics';
import {
  activePouvoir,
  comptePasse,
  DEF_POUVOIRS,
  GUIDE_BONUS,
  iaPouvoirs,
  majPouvoirs,
  POUVOIRS,
  pouvoirPret,
  SEUIL_PASSES_DEPART,
  SEUIL_PASSES_MAX,
  TIRAGE_S,
  tirePouvoir,
} from '../src/core/pouvoirs';
import { calculeRink } from '../src/core/rink';
import { creePartie, engagement } from '../src/core/rules';
import { pas } from '../src/core/simulation';
import type { MatchState, PouvoirId, Skater, TeamId } from '../src/core/types';
import { appliqueInstantane, decodeInstantane, EmetteurEntrees, encodeInstantane, EntreeDistante } from '../src/net/protocole';
import { INTENT_VIDE } from '../src/core/types';

const rink = calculeRink(400, 200);

function partie(pouvoirs = true): MatchState {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, pouvoirs });
  st.phase = 'jeu';
  return st;
}

/** Une passe réussie de `a` vers `b` (réception immédiate). */
function passe(st: MatchState, a: Skater, b: Skater): void {
  passeVers(st, a, b);
  prendPalet(st, b);
}

/** Enchaîne `n` passes dans l'équipe `eq`, entre ses deux premiers joueurs. */
function passes(st: MatchState, eq: TeamId, n: number): void {
  const [a, b] = st.patineurs.filter((s) => s.eq === eq);
  prendPalet(st, a!);
  for (let i = 0; i < n; i++) passe(st, i % 2 ? b! : a!, i % 2 ? a! : b!);
}

/** Donne directement un bonus prêt à l'équipe (tirage terminé). */
function donne(st: MatchState, eq: TeamId, id: PouvoirId): void {
  st.pouvoirs![eq].pret = id;
  st.pouvoirs![eq].tirage = 0;
}

describe('bonus : jauge de passes et tirage', () => {
  it('3 passes réussies débloquent un bonus tiré au sort, utilisable après le tirage', () => {
    const st = partie();
    passes(st, 0, SEUIL_PASSES_DEPART - 1);
    expect(st.pouvoirs![0].passes).toBe(SEUIL_PASSES_DEPART - 1);
    expect(st.pouvoirs![0].pret).toBeNull();
    passes(st, 0, 1);
    const pv = st.pouvoirs![0];
    expect(pv.pret).not.toBeNull();
    expect(DEF_POUVOIRS[pv.pret!].dispo).toBe(true);
    expect(pv.passes).toBe(0);
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'tirage')).toBe(true);
    // pendant le tirage, on ne peut pas encore le déclencher
    expect(activePouvoir(st, 0, st.controles[0])).toBe(false);
    majPouvoirs(st, TIRAGE_S + 0.01);
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'pret')).toBe(true);
    expect(pouvoirPret(st, 0)).toBe(true);
    expect(activePouvoir(st, 0, st.controles[0])).toBe(true);
    expect(pv.actif).not.toBeNull();
    expect(pv.pret).toBeNull();
    // le prochain bonus demande une passe de plus
    expect(pv.seuil).toBe(SEUIL_PASSES_DEPART + 1);
  });

  it('les passes ne comptent pas tant qu’un bonus est en main ou en cours', () => {
    const st = partie();
    donne(st, 0, 'vitesse');
    passes(st, 0, 5);
    expect(st.pouvoirs![0].passes).toBe(0);
    activePouvoir(st, 0, st.controles[0]);
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

  it('le seuil monte d’une passe par bonus utilisé, jusqu’au maximum', () => {
    const st = partie();
    for (let i = 0; i < 10; i++) {
      donne(st, 0, 'vitesse');
      activePouvoir(st, 0, st.controles[0]);
      st.pouvoirs![0].actif = null;
    }
    expect(st.pouvoirs![0].seuil).toBe(SEUIL_PASSES_MAX);
  });

  it('tirage pondéré : seuls les bonus déjà en jeu sortent, chacun avec la même chance', () => {
    const st = partie();
    const dispo = POUVOIRS.filter((id) => DEF_POUVOIRS[id].dispo);
    const compte = new Map<PouvoirId, number>();
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const id = tirePouvoir(st, 0, (i + 0.5) / N);
      compte.set(id, (compte.get(id) ?? 0) + 1);
    }
    expect([...compte.keys()].sort()).toEqual([...dispo].sort());
    for (const n of compte.values()) expect(n).toBeCloseTo(N / dispo.length, -1);
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
    activePouvoir(st, 0, st.controles[0]);
    st.phase = 'but';
    majPouvoirs(st, 10);
    expect(st.pouvoirs![0].actif).toBe('vitesse');
    st.phase = 'jeu';
    majPouvoirs(st, DEF_POUVOIRS.vitesse.duree + 0.1);
    expect(st.pouvoirs![0].actif).toBeNull();
    expect(st.evenements.some((e) => e.type === 'pouvoir' && e.quoi === 'fin')).toBe(true);
  });
});

describe('bonus : effets', () => {
  it('super vitesse : le joueur doré va nettement plus vite', () => {
    const vitesse = (avecBonus: boolean) => {
      const st = partie();
      const s = st.controles[0]!;
      if (avecBonus) {
        donne(st, 0, 'vitesse');
        activePouvoir(st, 0, s);
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
    activePouvoir(st, 0, st.controles[0]);
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

  it('tir guidé : le tir est plus dangereux et s’incurve vers la cage', () => {
    const st = partie();
    const s = st.controles[0]!;
    s.x = rink.cx;
    s.y = rink.cy - 50;
    s.tient = true;
    st.palet.porteur = s;
    donne(st, 0, 'guide');
    activePouvoir(st, 0, s);
    // tir parallèle à la ligne de but : sans guidage, il passerait loin de la cage
    tir(st, rink, s, 0, 1);
    expect(st.palet.guide).not.toBeNull();
    expect(st.pouvoirs![0].actif).toBeNull();
    expect(GUIDE_BONUS).toBeGreaterThan(0);
    const segs = segmentsCage(rink, false);
    for (let i = 0; i < 40; i++) majPalet(rink, st, 1 / 240, segs);
    expect(st.palet.vy).toBeGreaterThan(30);
  });

  it('ricochet : le palet repart de la bande au moins aussi vite qu’il y est arrivé', () => {
    const rebond = (avecBonus: boolean) => {
      const st = partie();
      const s = st.controles[0]!;
      if (avecBonus) {
        donne(st, 0, 'ricochet');
        activePouvoir(st, 0, s);
      }
      for (const o of st.patineurs) o.y = rink.cy + 80;
      const p = st.palet;
      p.porteur = null;
      p.dernier = s;
      p.x = rink.cx;
      p.y = rink.y + 10;
      p.vx = 0;
      p.vy = -300;
      const segs = segmentsCage(rink, false);
      for (let i = 0; i < 20; i++) majPalet(rink, st, 1 / 240, segs);
      return p.vy;
    };
    expect(rebond(true)).toBeGreaterThan(290);
    expect(rebond(false)).toBeLessThan(250);
  });

  it('mode savon : une mise en échec contre l’équipe glisse en esquive', () => {
    const st = partie();
    donne(st, 0, 'savon');
    activePouvoir(st, 0, st.controles[0]);
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

  it('l’ordinateur déclenche son bonus quand il a le palet', () => {
    const st = partie();
    donne(st, 1, 'vitesse');
    const porteur = st.patineurs.find((s) => s.eq === 1)!;
    prendPalet(st, porteur);
    st.pouvoirs![1].attente = 1;
    iaPouvoirs(rink, st);
    expect(st.pouvoirs![1].actif).toBe('vitesse');
    expect(st.pouvoirs![1].dore).toBe(porteur.rang);
  });
});

describe('bonus en Wi-Fi', () => {
  it('l’instantané transporte les bonus et la traînée du palet', () => {
    const st = partie();
    st.humains = [true, true];
    st.pouvoirs![0].passes = 2;
    donne(st, 1, 'ricochet');
    st.pouvoirs![1].tirage = 0.5;
    st.pouvoirs![0].actif = 'double';
    st.pouvoirs![0].reste = Infinity;
    st.palet.lueur = 1;
    const inst = decodeInstantane(encodeInstantane(st, rink, 3))!;
    const client = partie();
    appliqueInstantane(client, inst, inst, 1, rink);
    expect(client.pouvoirs![0].passes).toBe(2);
    expect(client.pouvoirs![0].actif).toBe('double');
    expect(client.pouvoirs![0].reste).toBe(Infinity);
    expect(client.pouvoirs![1].pret).toBe('ricochet');
    expect(client.pouvoirs![1].tirage).toBeCloseTo(0.5, 2);
    expect(client.palet.lueur).toBe(1);

    const sans = decodeInstantane(encodeInstantane(partie(false), rink, 4))!;
    expect(sans.pouvoirs).toBeNull();
  });

  it('l’appui sur BONUS arrive une seule fois à l’hôte', () => {
    const em = new EmetteurEntrees();
    const hote = new EntreeDistante();
    hote.recoit(em.encode(INTENT_VIDE), 0);
    const p = em.encode({ ...INTENT_VIDE, bonusAppui: true });
    hote.recoit(p, 0.01);
    hote.recoit(p, 0.02);
    expect(hote.prochain(0.02).bonusAppui).toBe(true);
    expect(hote.prochain(0.03).bonusAppui).toBe(false);
  });
});
