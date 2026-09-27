import { describe, expect, it } from 'vitest';
import { menaceEchec, passeVers, prendPalet, surReception, tir } from '../src/core/actions';
import { COMBO_BONUS, ECHEC_PREPA, ECHEC_PREPA_MAX, ESQUIVE_SONNE, UNE_TOUCHE_BONUS, UNE_TOUCHE_S } from '../src/core/constants';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { pointDeSoutien } from '../src/core/ai';
import { appliqueEntreeJoueur, cibleEchec } from '../src/core/humanControl';
import { pas } from '../src/core/simulation';
import { INTENT_VIDE, type MatchState, type Skater } from '../src/core/types';

const rink = calculeRink(400, 200);

/** Deux attaquants de l'équipe 0 face au but de droite, le reste loin de l'action. */
function situation(): { st: MatchState; a: Skater; b: Skater } {
  const st = creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  st.phase = 'jeu';
  for (const s of st.patineurs) {
    s.x = rink.cx - 120;
    s.y = rink.cy + 70;
  }
  const [a, b] = st.patineurs.filter((s) => s.eq === 0) as [Skater, Skater];
  Object.assign(a, { x: rink.butD - 90, y: rink.cy - 30, face: 0, vx: 0, vy: 0 });
  Object.assign(b, { x: rink.butD - 60, y: rink.cy + 25, face: 0, vx: 0, vy: 0 });
  Object.assign(st.gardiens[1]!, { x: rink.butD - 2.5, y: rink.cy });
  return { st, a, b };
}

/** Qualité d'un tir identique, depuis la même position, selon ce qui l'a précédé. */
function qualite(prepare: (st: MatchState, a: Skater, b: Skater) => void): number {
  const { st, a, b } = situation();
  prepare(st, a, b);
  // tir un peu à côté du gardien : qualité de base modeste, pour voir les bonus sans plafond
  const gk = st.gardiens[1]!;
  const ang = Math.atan2(gk.y + 5 - b.y, rink.butD - b.x);
  tir(st, rink, b, ang, 0.8);
  return st.palet.qualite;
}

describe('jeu de passes', () => {
  it('chaque passe de la séquence rend le tir plus dangereux', () => {
    const seul = qualite((st, _a, b) => prendPalet(st, b));
    const apresDeux = qualite((st, _a, b) => {
      prendPalet(st, b);
      st.combo[0] = 2;
      st.reception = null;
    });
    expect(apresDeux).toBeCloseTo(seul + 2 * COMBO_BONUS, 5);
  });

  it('un tir sur réception (une-touche) prend le gardien à contre-pied', () => {
    const seul = qualite((st, _a, b) => prendPalet(st, b));
    const uneTouche = qualite((st, a, b) => {
      prendPalet(st, a);
      st.palet.passe = { vers: b, t: 1, facile: false };
      prendPalet(st, b); // passe reçue à l'instant
      expect(surReception(st, b)).toBe(true);
    });
    // la passe compte aussi dans la séquence
    expect(uneTouche).toBeCloseTo(seul + UNE_TOUCHE_BONUS + COMBO_BONUS, 5);
  });

  it('la fenêtre du tir sur réception se referme', () => {
    const { st, a, b } = situation();
    prendPalet(st, a);
    st.palet.passe = { vers: b, t: 1, facile: false };
    prendPalet(st, b);
    st.temps += UNE_TOUCHE_S + 0.01;
    expect(surReception(st, b)).toBe(false);
  });

  it('une passe arrive, même au receveur qui ne bouge pas, malgré un adversaire près de la ligne', () => {
    const { st, a, b } = situation();
    const adv = st.patineurs.find((s) => s.eq === 1)!;
    // un adversaire à 11 px de la ligne de passe, au milieu, crosse tournée de l'autre côté
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    Object.assign(adv, { x: (a.x + b.x) / 2 + nx * 11, y: (a.y + b.y) / 2 + ny * 11, face: Math.atan2(ny, nx), vx: 0, vy: 0 });
    // tout le monde reste sur place : on teste la réception, pas la course de l'IA vers le palet
    for (const s of st.patineurs) Object.assign(s.ia, { t: 99, tx: s.x, ty: s.y });
    prendPalet(st, a);
    passeVers(st, a, b, 0);
    for (let i = 0; i < 60 && !st.palet.porteur; i++) pas(rink, st, 1 / 60);
    expect(st.palet.porteur).toBe(b);
  });

  it('un but au bout de deux passes est fêté comme un but collectif', () => {
    const { st, b } = situation();
    const gk = st.gardiens[1]!;
    gk.vit = 0;
    gk.a = -1.3;
    prendPalet(st, b);
    st.combo[0] = 2;
    tir(st, rink, b, Math.atan2(rink.cy + 6 - b.y, rink.butD - b.x), 1);
    for (let i = 0; i < 60 && st.phase === 'jeu'; i++) pas(rink, st, 1 / 60);
    const annonce = st.evenements.find((e) => e.type === 'annonce');
    expect(st.score[0]).toBe(1);
    expect(annonce && 'txt' in annonce ? annonce.txt : '').toBe('BUT COLLECTIF !');
  });
});

describe('passes selon la zone, bouton de tir malin, démarquage', () => {
  it('une passe partie de sa propre moitié est « facile »', () => {
    const { st, a, b } = situation();
    for (const gk of st.gardiens) gk.x = gk.eq === 0 ? rink.butG + 3 : rink.butD - 3;
    prendPalet(st, a);
    passeVers(st, a, b);
    expect(st.palet.passe?.facile).toBe(false); // on attaque près de la cage adverse
    const { st: st2, a: a2, b: b2 } = situation();
    for (const gk of st2.gardiens) gk.x = gk.eq === 0 ? rink.butG + 3 : rink.butD - 3;
    a2.x = rink.cx - 80;
    b2.x = rink.cx - 40;
    prendPalet(st2, a2);
    passeVers(st2, a2, b2);
    expect(st2.palet.passe?.facile).toBe(true);
  });

  it('le bouton de tir arme toujours un tir, même dans sa moitié', () => {
    const { st, a, b } = situation();
    a.x = rink.cx - 100;
    b.x = rink.cx - 60;
    prendPalet(st, a);
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, tirAppui: true, tirTenu: true }, 1 / 60);
    expect(a.arme).toBe(true);
    expect(a.tient).toBe(true);
    expect(st.palet.passe).toBeFalsy();
  });

  it('le coéquipier se démarque : son point de soutien est loin des adversaires', () => {
    const { st, a, b } = situation();
    prendPalet(st, a);
    const eux = st.patineurs.filter((s) => s.eq === 1);
    // les défenseurs collés à l'endroit où le soutien se placerait sinon (enclave, côté bas)
    eux.forEach((e, i) => Object.assign(e, { x: rink.butD - 55 + i * 4, y: rink.cy + 22 - i * 3 }));
    const pt = pointDeSoutien(rink, st, b, a, true);
    const libre = Math.min(...eux.map((e) => Math.hypot(e.x - pt.x, e.y - pt.y)));
    expect(libre).toBeGreaterThan(25);
  });
});

describe('bouton ÉCHEC', () => {
  it('sans le palet, le gros bouton fonce sur le porteur adverse et le met en échec', () => {
    const { st, a } = situation();
    const [p1, p2] = st.patineurs.filter((s) => s.eq === 1) as [Skater, Skater];
    // le porteur à 40 px, un autre adversaire plus près mais sans le palet
    Object.assign(p1, { x: a.x + 40, y: a.y + 6, vx: 0, vy: 0 });
    Object.assign(p2, { x: a.x - 20, y: a.y - 8, vx: 0, vy: 0 });
    prendPalet(st, p1);
    // ce test vérifie l'échec, pas l'esquive ni les passes de l'IA, ni un vol à la
    // crosse avant le choc (aléatoires) : IA figées sur place, pas de harponnage
    st.nivEq[1].esquive = 0;
    for (const s of st.patineurs) Object.assign(s.ia, { t: 99, tx: s.x, ty: s.y });
    a.recupCd = 99;
    expect(cibleEchec(st, a)).toBe(p1);
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, tirAppui: true, tirTenu: true }, 1 / 60);
    expect(a.elanT).toBeGreaterThan(0);
    for (let i = 0; i < 30 && p1.tient; i++) pas(rink, st, 1 / 60);
    expect(p1.tient).toBe(false);
    expect(p1.sonne).toBeGreaterThan(0);
  });
});

describe('esquive et coup de crosse', () => {
  /** Le porteur `a` (humain) et un défenseur lancé en mise en échec vers lui, à 30 px. */
  function echecEnApproche() {
    const { st, a } = situation();
    const d = st.patineurs.find((s) => s.eq === 1)!;
    for (const s of st.patineurs) Object.assign(s.ia, { t: 99, tx: s.x, ty: s.y });
    prendPalet(st, a);
    a.humain = true;
    Object.assign(d, { x: a.x + 30, y: a.y, vx: -220, vy: 0, elanT: 0.3, face: Math.PI });
    return { st, a, d };
  }

  it('appuyer sur SPRINT pile quand l’échec arrive : le défenseur est esquivé et trébuche', () => {
    const { st, a, d } = echecEnApproche();
    expect(menaceEchec(st, a)).toBe(d);
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(a.esquiveT).toBeGreaterThan(0);
    expect(d.sonne).toBeGreaterThan(1);
    expect(st.figeT).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) pas(rink, st, 1 / 60);
    expect(a.tient).toBe(true);
  });

  it('le défenseur esquivé tombe et glisse dans le sens de sa charge, sans bousculer personne', () => {
    const { st, a, d } = echecEnApproche();
    const x0 = d.x;
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(d.chuteT).toBeCloseTo(ESQUIVE_SONNE, 5);
    expect(d.flashT).toBeGreaterThan(0);
    expect(Math.cos(d.face)).toBeLessThan(-0.99); // tête vers la gauche, comme sa charge
    // un coéquipier du porteur couché sur la trajectoire : on lui glisse dessous
    const m = st.patineurs.find((q) => q.eq === 0 && q !== a)!;
    Object.assign(m, { x: d.x - 20, y: d.y, vx: 0, vy: 0 });
    Object.assign(m.ia, { tx: m.x, ty: m.y });
    const mx = m.x;
    for (let i = 0; i < 90; i++) pas(rink, st, 1 / 60);
    const glisse = x0 - d.x;
    expect(glisse).toBeGreaterThan(25);
    expect(glisse).toBeLessThan(50);
    expect(Math.abs(m.x - mx)).toBeLessThan(1);
    for (let i = 0; i < 30; i++) pas(rink, st, 1 / 60);
    expect(d.chuteT).toBe(0);
  });

  it('une mise en échec réussie : flash blanc et court arrêt sur image, sans bulle de texte', () => {
    const { st, a, d } = echecEnApproche();
    st.nivEq[0].esquive = 0;
    Object.assign(d, { x: a.x + 8 });
    pas(rink, st, 1 / 60);
    expect(a.tient).toBe(false);
    expect(a.flashT).toBeGreaterThan(0);
    expect(st.figeT).toBeGreaterThan(0);
    expect(st.evenements.some((e) => e.type === 'bulle')).toBe(false);
  });

  it('matraquer le bouton ne marche pas : un appui hors fenêtre bloque l’esquive un instant', () => {
    const { st, a, d } = echecEnApproche();
    d.elanT = 0; // pas encore de menace
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(a.esquiveVerrou).toBeGreaterThan(0);
    d.elanT = 0.3;
    appliqueEntreeJoueur(rink, st, a, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(a.esquiveT).toBe(0);
  });

  it('face à un humain, l’IA prépare sa mise en échec : le « ! » laisse plus de 0,4 s pour esquiver', () => {
    const { st, a, d } = echecEnApproche();
    Object.assign(d, { x: a.x + 20, vx: 0, elanT: 0, elanCd: 0, prepaEchecT: ECHEC_PREPA_MAX });
    // le défenseur reste sur le porteur (sans quoi il repart vers sa place et peut
    // sortir de portée), sans lui chiper le palet à la crosse (aléatoire)
    Object.assign(d.ia, { tx: a.x, ty: a.y });
    d.recupCd = 99;
    st.nivEq[1].esquive = 0;
    let fenetre = 0;
    // départ de la charge : l'élan arme sa recharge (l'élan lui-même retombe à 0 au choc)
    for (let i = 0; i < 120 && d.elanCd <= 0; i++) {
      if (menaceEchec(st, a)) fenetre += 1 / 60;
      pas(rink, st, 1 / 60);
    }
    expect(d.elanCd).toBeGreaterThan(0);
    expect(fenetre).toBeGreaterThanOrEqual(ECHEC_PREPA - 0.02);
    // esquiver pendant la préparation marche aussi : le défenseur reste sonné
    const e = echecEnApproche();
    Object.assign(e.d, { x: e.a.x + 20, vx: 0, elanT: 0, prepaEchecT: ECHEC_PREPA_MAX });
    appliqueEntreeJoueur(rink, e.st, e.a, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(e.a.esquiveT).toBeGreaterThan(0);
    expect(e.d.prepaEchecT).toBe(0);
    expect(e.d.sonne).toBeGreaterThan(1);
  });

  it('sans le palet, le petit bouton donne un coup de crosse, avec une recharge', () => {
    const { st, a, d } = echecEnApproche();
    Object.assign(d, { elanT: 0, vx: 0 });
    appliqueEntreeJoueur(rink, st, d, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(d.pokeT).toBeGreaterThan(0);
    const avant = d.pokeT;
    appliqueEntreeJoueur(rink, st, d, { ...INTENT_VIDE, elanAppui: true }, 1 / 60);
    expect(d.pokeT).toBe(avant);
    expect(a.tient).toBe(true);
  });
});
