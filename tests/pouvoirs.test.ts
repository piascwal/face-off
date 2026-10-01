import { describe, expect, it, vi } from 'vitest';
import { coupDeCrosse, passeVers, pointCrosse, prendPalet, tir } from '../src/core/actions';
import { bougePatineur, collisionsPatineurs, majPalet, recuperations, segmentsCage } from '../src/core/physics';
import {
  activePouvoir,
  boutonBonus,
  comptePasse,
  DEF_POUVOIRS,
  majPouvoirs,
  POUVOIRS,
  pouvoirPret,
  SEUIL_PASSES,
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
    Object.assign(voleur, { x: rink.cx + 16, y: rink.cy, face: Math.PI, vx: 0, vy: 0, pokeT: -10, recupCd: 0 });
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
    activePouvoir(rink, st, 1, st.patineurs.find((s) => s.eq === 1)!);
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
    const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, entrainement: 'vitesse' });
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
