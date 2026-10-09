import { describe, expect, it } from 'vitest';
import { passeVers, prendPalet, tir } from '../src/core/actions';
import { collisionsPatineurs } from '../src/core/collisions';
import { appliqueEntreeJoueur } from '../src/core/humanControl';
import { calculeRink } from '../src/core/rink';
import { creePartie } from '../src/core/rules';
import { estStar, moyenne, mult, resumeNotes, STATS_PATINEUR } from '../src/core/stats';
import { EQUIPES_JOUABLES, PROFIL_NEUTRE, trouveEquipe, type TeamProfile } from '../src/core/teams';
import { INTENT_VIDE, type MatchState, type Skater } from '../src/core/types';

const rink = calculeRink(400, 200);

/** Une équipe dont toutes les notes valent `n` (sauf celles qu'on précise). */
const equipe = (n: number, autres: Partial<TeamProfile> = {}): TeamProfile => ({
  id: 'test',
  // le joueur star de ces équipes de test : 6 points de plus partout
  star: { vit: n + 6, att: n + 6, def: n + 6, frappe: n + 6, puiss: n + 6, passe: n + 6, phys: n + 6 },
  vit: n,
  att: n,
  def: n,
  frappe: n,
  puiss: n,
  passe: n,
  phys: n,
  gardien: n,
  ...autres,
});
const match = (joueur: TeamProfile, adverse: TeamProfile = PROFIL_NEUTRE): MatchState =>
  creePartie(rink, { mode: 'match', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1, equipeJoueur: joueur, equipeAdverse: adverse });
const premier = (st: MatchState, eq = 0): Skater => st.patineurs.find((s) => s.eq === eq && s.rang === 0)!;
const normal = (st: MatchState, eq = 0): Skater => st.patineurs.find((s) => s.eq === eq && s.rang === 1)!;

describe('notes et multiplicateurs', () => {
  it('85 ne change rien, 70 et 100 valent −15 % et +15 % (coefficient à 1)', () => {
    expect(mult(85, 1)).toBeCloseTo(1);
    expect(mult(70, 1)).toBeCloseTo(0.85);
    expect(mult(100, 1)).toBeCloseTo(1.15);
  });

  it('le coefficient global règle l’écart sans toucher aux notes', () => {
    expect(mult(100, 0)).toBe(1);
    expect(mult(100, 0.5)).toBeCloseTo(1.075);
    expect(mult(100, 2)).toBeCloseTo(1.3);
    expect(mult(70, 2)).toBeCloseTo(0.7);
  });

  it('toutes les équipes jouables ont des notes entre 70 et 100', () => {
    for (const e of EQUIPES_JOUABLES) for (const k of [...STATS_PATINEUR, 'gardien'] as const) {
      expect(e[k], `${e.id} ${k}`).toBeGreaterThanOrEqual(70);
      expect(e[k], `${e.id} ${k}`).toBeLessThanOrEqual(100);
    }
  });

  it('les résumés ATT / DEF / GLB restent entre 70 et 100 et Montpellier est la meilleure équipe', () => {
    const globales = EQUIPES_JOUABLES.map((e) => ({ id: e.id, ...resumeNotes(e) }));
    for (const r of globales) for (const v of [r.attaque, r.defense, r.globale]) {
      expect(v).toBeGreaterThanOrEqual(70);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect([...globales].sort((a, b) => b.globale - a.globale)[0]!.id).toBe('montpellier');
  });

  it('le joueur star a son propre profil : meilleur en moyenne, pas forcément sur chaque note', () => {
    for (const e of EQUIPES_JOUABLES) {
      // plus haut en moyenne que ses coéquipiers d'au moins 3 points
      expect(moyenne(e.star) - moyenne(e), e.id).toBeGreaterThanOrEqual(3);
      for (const k of STATS_PATINEUR) {
        expect(e.star[k], `${e.id} ${k}`).toBeGreaterThanOrEqual(70);
        expect(e.star[k], `${e.id} ${k}`).toBeLessThanOrEqual(100);
      }
    }
    // un profil spécialisé : plusieurs équipes ont un joueur star moins bon que les autres sur au moins une note
    expect(EQUIPES_JOUABLES.filter((e) => STATS_PATINEUR.some((k) => e.star[k] < e[k])).length).toBeGreaterThanOrEqual(10);
    // et il n'est pas simplement « les mêmes notes plus un bonus » : l'écart varie d'une note à l'autre
    for (const e of EQUIPES_JOUABLES) {
      const ecarts = STATS_PATINEUR.map((k) => e.star[k] - e[k]);
      expect(Math.max(...ecarts) - Math.min(...ecarts), e.id).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('qui est le joueur star', () => {
  it('le premier patineur de chaque équipe, jamais un renfort', () => {
    const st = match(equipe(80));
    for (const eq of [0, 1] as const) {
      const stars = st.patineurs.filter((s) => s.eq === eq && estStar(s));
      expect(stars).toEqual([premier(st, eq)]);
    }
    expect(estStar({ rang: 0, renfort: true })).toBe(false);
  });

  it('il a des multiplicateurs plus hauts que ses coéquipiers, sur toute l’équipe (humains, coéquipiers et adversaires)', () => {
    const st = match(equipe(80), equipe(90));
    for (const k of STATS_PATINEUR) {
      expect(premier(st).st[k]).toBeGreaterThan(normal(st).st[k]);
      expect(premier(st, 1).st[k]).toBeGreaterThan(normal(st, 1).st[k]);
    }
    // les notes de l'adversaire s'appliquent à l'adversaire, pas à nous
    expect(normal(st, 1).st.vit).toBeCloseTo(mult(90));
    expect(normal(st, 0).st.vit).toBeCloseTo(mult(80));
  });
});

describe('un vrai profil de joueur star', () => {
  it('ses multiplicateurs sont ceux de son profil, pas ceux de ses coéquipiers gonflés', () => {
    const nice = trouveEquipe('nice');
    const st = match(nice);
    // Nice : un joueur star bien plus passeur et moins costaud que le reste de l'équipe
    expect(premier(st).st.passe).toBeCloseTo(mult(nice.star.passe));
    expect(normal(st).st.passe).toBeCloseTo(mult(nice.passe));
    expect(premier(st).st.passe).toBeGreaterThan(normal(st).st.passe);
    expect(premier(st).st.def).toBeLessThan(normal(st).st.def);
  });
});

describe('ce que font les notes', () => {
  it('VITESSE : la vitesse de patinage', () => {
    expect(normal(match(equipe(100))).vit / normal(match(equipe(70))).vit).toBeCloseTo(mult(100) / mult(70));
  });

  it('PUISSANCE : la vitesse du palet à la sortie de la crosse', () => {
    const v = (n: number) => {
      const st = match(equipe(85, { puiss: n }));
      const s = normal(st);
      s.tient = true;
      tir(st, rink, s, 0, 0.5);
      return Math.hypot(st.palet.vx, st.palet.vy);
    };
    expect(v(100) / v(70)).toBeCloseTo(mult(100) / mult(70), 1);
  });

  it('FRAPPE : le temps de chargement de la jauge de tir (humain)', () => {
    const charge = (n: number) => {
      const st = match(equipe(85, { frappe: n }));
      st.phase = 'jeu';
      const s = normal(st);
      Object.assign(s, { x: 150, y: 100 });
      prendPalet(st, s);
      appliqueEntreeJoueur(rink, st, s, { ...INTENT_VIDE, tirTenu: true }, 0.01);
      for (let i = 0; i < 20; i++) appliqueEntreeJoueur(rink, st, s, { ...INTENT_VIDE, tirTenu: true }, 0.01);
      return s.charge;
    };
    expect(charge(100) / charge(70)).toBeCloseTo(mult(100) / mult(70), 1);
  });

  it('PASSE : la précision des passes (humain comme ordinateur)', () => {
    const dispersion = (n: number) => {
      let somme = 0;
      const N = 2000;
      for (let k = 0; k < N; k++) {
        const st = match(equipe(85, { passe: n }));
        st.phase = 'jeu';
        const [a, b] = st.patineurs.filter((s) => s.eq === 0 && s.rang !== 0) as [Skater, Skater];
        Object.assign(a, { x: 100, y: 100, vx: 0, vy: 0 });
        Object.assign(b, { x: 220, y: 100, vx: 0, vy: 0 });
        prendPalet(st, a);
        passeVers(st, a, b, 0.2);
        somme += Math.abs(Math.atan2(st.palet.vy, st.palet.vx));
      }
      return somme / N;
    };
    expect(dispersion(100)).toBeLessThan(dispersion(70) * 0.92);
  });

  it('PHYSIQUE : un joueur costaud encaisse mieux la mise en échec et la donne plus fort', () => {
    const sonne = (attaquant: number, cible: number) => {
      const st = match(equipe(attaquant), equipe(cible));
      st.phase = 'jeu';
      const [s, o] = [normal(st, 0), normal(st, 1)];
      for (const x of st.patineurs) Object.assign(x, { x: 30, y: 30, vx: 0, vy: 0 });
      Object.assign(s, { x: 200, y: 100, elanT: 0.2 });
      Object.assign(o, { x: 207, y: 100, sonne: 0, esquiveT: 0 });
      collisionsPatineurs(st);
      return o.sonne;
    };
    expect(sonne(100, 70)).toBeGreaterThan(sonne(85, 85));
    expect(sonne(70, 100)).toBeLessThan(sonne(85, 85));
  });

  it('PHYSIQUE : un porteur bien plus costaud garde parfois le palet malgré le choc', () => {
    const garde = (attaquant: number, cible: number) => {
      let n = 0;
      for (let k = 0; k < 300; k++) {
        const st = match(equipe(attaquant), equipe(cible));
        st.phase = 'jeu';
        const [s, o] = [normal(st, 0), normal(st, 1)];
        for (const x of st.patineurs) Object.assign(x, { x: 30, y: 30, vx: 0, vy: 0 });
        Object.assign(s, { x: 200, y: 100, elanT: 0.2 });
        Object.assign(o, { x: 207, y: 100, sonne: 0, esquiveT: 0 });
        prendPalet(st, o);
        collisionsPatineurs(st);
        if (o.tient) n++;
      }
      return n;
    };
    expect(garde(70, 100)).toBeGreaterThan(40);
    expect(garde(85, 85)).toBe(0);
    expect(garde(100, 70)).toBe(0);
  });

  it('GARDIEN : les réflexes du gardien', () => {
    expect(match(equipe(100)).gardiens[0].vit / match(equipe(70)).gardiens[0].vit).toBeCloseTo(mult(100) / mult(70));
  });

  it('notes neutres : les patineurs normaux retrouvent exactement les réglages d’origine', () => {
    const st = match(PROFIL_NEUTRE);
    for (const s of st.patineurs.filter((x) => !estStar(x))) {
      expect(s.vit).toBeCloseTo(1);
      expect(s.st).toEqual({ vit: 1, att: 1, def: 1, frappe: 1, puiss: 1, passe: 1, phys: 1 });
    }
    // des notes neutres pour le joueur star aussi : tout le monde à 1
    expect(premier(st).st.vit).toBeCloseTo(1);
  });
});

describe('stats depuis la pause', () => {
  it('retrouve les deux équipes du match (variante comprise) avec leurs notes', async () => {
    const { cartesDuMatch } = await import('../src/render/stats-pause');
    const { EQUIPES_JOUABLES: defs, resoutEquipe } = await import('../src/render/team-visuals');
    const cartes = cartesDuMatch([resoutEquipe(defs[0]!, 'exterieur'), resoutEquipe(defs[1]!, 'interieur')]);
    expect(cartes).not.toBeNull();
    expect(cartes![0].def.id).toBe(defs[0]!.id);
    expect(cartes![1].profil).toEqual(trouveEquipe(defs[1]!.id));
    expect(cartesDuMatch([{ ...resoutEquipe(defs[0]!, 'interieur'), teamId: 'inconnue' }, resoutEquipe(defs[1]!, 'interieur')])).toBeNull();
  });
});
