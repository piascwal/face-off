import { describe, expect, it } from 'vitest';
import {
  appliqueAction,
  arrive,
  avanceAbsence,
  avanceReprise,
  compositionHumaine,
  joueurAbsent,
  joueurPart,
  joueurRevenu,
  lisAction,
  lisEtatPartie,
  matchFige,
  nouvellePartie,
  peutLancer,
  REPRISE_S,
  roleDe,
  siegeReel,
  siegesLibres,
  SPECTATEURS_MAX,
  tousOntPasse,
  versAttente,
  versFin,
  type ConfigLan,
  type EtatPartieLan,
  type FormatLan,
} from '../src/net/partie';

const CONFIG: ConfigLan = { effectif: 0, duree: 1, assistTir: true, assistPasse: false, changementAuto: true, ralenti: true, pouvoirs: false, format: '1v1', niveau: 1 };
const A = '0123456789abcdef';
const B = 'fedcba9876543210';
const C = '1111111111111111';
const D = '2222222222222222';

/** Une salle d'attente : l'hôte (A) est assis, les autres arrivent et prennent les sièges demandés. */
function salle(format: FormatLan, sieges: Partial<Record<string, 1 | 2 | 3>> = {}): EtatPartieLan {
  const e = nouvellePartie({ ...CONFIG, format }, 'LYNX 12', 'toulouse', A);
  const noms: Record<string, string> = { [B]: 'ORQUE 7', [C]: 'FAUCON', [D]: 'LOUP' };
  for (const [appareil, siege] of Object.entries(sieges)) {
    arrive(e, noms[appareil]!, appareil);
    appliqueAction(e, appareil, { a: 'siege', siege: siege! });
  }
  return e;
}

/** 1 contre 1 : l'hôte (A1) et l'invité (B1). */
const partieADeux = () => salle('1v1', { [B]: 2 });

describe('partie Wi-Fi 1 contre 1 : on n’avance que quand les deux ont validé', () => {
  it('seul l’hôte lance, et seulement avec un adversaire', () => {
    const seul = nouvellePartie(CONFIG, 'LYNX 12', 'toulouse', A);
    appliqueAction(seul, A, { a: 'lancer' });
    expect(seul.phase).toBe('attente');
    const e = partieADeux();
    appliqueAction(e, B, { a: 'lancer' });
    expect(e.phase).toBe('attente');
    appliqueAction(e, A, { a: 'lancer' });
    expect(e.phase).toBe('equipes');
  });

  it('équipes puis maillots, chacun ne touche qu’à son côté, verrouillé une fois prêt', () => {
    const e = partieADeux();
    appliqueAction(e, A, { a: 'lancer' });
    appliqueAction(e, B, { a: 'equipe', equipe: 'nice' });
    expect(e.camps[1].equipe).toBe('nice');
    expect(e.camps[0].equipe).toBe('toulouse');
    appliqueAction(e, B, { a: 'equipe', equipe: 'toulouse' });
    appliqueAction(e, B, { a: 'pret', pret: true });
    appliqueAction(e, B, { a: 'equipe', equipe: 'nice' }); // verrouillé
    expect(e.camps[1].equipe).toBe('toulouse');
    expect(e.phase).toBe('equipes');
    appliqueAction(e, A, { a: 'pret', pret: true });
    expect(e.phase).toBe('maillots');
    // même club : le camp de droite part en extérieur, et personne n'est encore prêt
    expect(e.camps[0].variante).toBe('interieur');
    expect(e.camps[1].variante).toBe('exterieur');
    expect(e.sieges.some((j) => j?.pret)).toBe(false);
  });

  it('chacun ne règle que sa propre équipe, même s’il demande l’autre camp', () => {
    const e = partieADeux();
    appliqueAction(e, A, { a: 'lancer' });
    appliqueAction(e, B, { a: 'equipe', equipe: 'nice', camp: 0 });
    expect(e.camps[0].equipe).toBe('toulouse');
    expect(e.camps[1].equipe).toBe('nice');
  });

  it('refuse deux maillots identiques, démarre quand tout est bon', () => {
    const e = partieADeux();
    appliqueAction(e, A, { a: 'lancer' });
    appliqueAction(e, A, { a: 'equipe', equipe: 'nice' });
    appliqueAction(e, A, { a: 'pret', pret: true });
    appliqueAction(e, B, { a: 'equipe', equipe: 'nice' });
    appliqueAction(e, B, { a: 'pret', pret: true });
    expect(e.phase).toBe('maillots');
    appliqueAction(e, B, { a: 'variante', variante: 'interieur' });
    appliqueAction(e, A, { a: 'pret', pret: true });
    expect(e.camps[1].variante).toBe('interieur');
    expect(appliqueAction(e, B, { a: 'pret', pret: true })).toBe(false);
    expect(e.sieges[2]!.pret).toBe(false);
    appliqueAction(e, B, { a: 'variante', variante: 'exterieur' });
    expect(appliqueAction(e, B, { a: 'pret', pret: true })).toBe(true);
    expect(e.phase).toBe('match');
  });

  it('MODIFIER annule son « prêt »', () => {
    const e = partieADeux();
    appliqueAction(e, A, { a: 'lancer' });
    appliqueAction(e, A, { a: 'pret', pret: true });
    appliqueAction(e, A, { a: 'pret', pret: false });
    appliqueAction(e, B, { a: 'pret', pret: true });
    expect(e.phase).toBe('equipes');
  });

  it('la pause vaut pour tous, la reprise passe par un compte à rebours', () => {
    const e = partieADeux();
    e.phase = 'match';
    appliqueAction(e, B, { a: 'pause', on: true });
    expect(e.pause).toBe(2);
    expect(matchFige(e)).toBe(true);
    appliqueAction(e, A, { a: 'pause', on: false });
    expect(e.pause).toBeNull();
    expect(e.reprise).toBe(REPRISE_S);
    expect(matchFige(e)).toBe(true);
    expect(avanceReprise(e, 1)).toBe(false);
    expect(avanceReprise(e, REPRISE_S)).toBe(true);
    expect(matchFige(e)).toBe(false);
  });

  it('en fin de match, on ne relance que si les deux votent pareil', () => {
    const e = partieADeux();
    e.phase = 'match';
    versFin(e);
    expect(appliqueAction(e, A, { a: 'vote', vote: 'rejouer' })).toBe(false);
    expect(appliqueAction(e, B, { a: 'vote', vote: 'equipes' })).toBe(false);
    expect(e.phase).toBe('fin');
    expect(appliqueAction(e, B, { a: 'vote', vote: 'rejouer' })).toBe(true);
    expect(e.phase).toBe('match');
    versFin(e);
    appliqueAction(e, A, { a: 'vote', vote: 'equipes' });
    appliqueAction(e, B, { a: 'vote', vote: 'equipes' });
    expect(e.phase).toBe('equipes');
    expect(e.sieges[0]!.pret).toBe(false);
  });

  it('le départ de l’adversaire ramène en salle d’attente', () => {
    const e = partieADeux();
    e.phase = 'match';
    e.pause = 0;
    joueurPart(e, 2);
    versAttente(e);
    expect(e.phase).toBe('attente');
    expect(e.sieges[2]).toBeNull();
    expect(e.pause).toBeNull();
  });

  it('valide l’état reçu (aller-retour JSON) et rejette un état truqué', () => {
    const e = salle('2v2', { [B]: 2, [C]: 1 });
    arrive(e, 'LOUP', D);
    expect(lisEtatPartie(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(lisEtatPartie({ ...e, phase: 'triche' })).toBeNull();
    expect(lisEtatPartie({ ...e, reprise: 99 })).toBeNull();
    expect(lisEtatPartie({ ...e, absent: 42.5 })?.absent).toBe(42.5);
    expect(lisEtatPartie({ ...e, absent: -1 })).toBeNull();
    expect(lisEtatPartie({ ...e, absent: undefined })).toBeNull();
    expect(lisEtatPartie({ ...e, sieges: [e.sieges[0], { ...e.sieges[1], nom: '<b>' }, null, null] })).toBeNull();
    expect(lisEtatPartie({ ...e, sieges: [null, null, null, null] })).toBeNull();
    expect(lisEtatPartie({ ...e, config: { ...e.config, format: '9v9' } })).toBeNull();
    expect(lisEtatPartie({ ...e, absents: [7] })).toBeNull();
    expect(lisEtatPartie({ ...e, pause: 4 })).toBeNull();
    expect(lisEtatPartie({ ...e, spectateurs: new Array(SPECTATEURS_MAX + 1).fill({ nom: 'X', appareil: D }) })).toBeNull();
    expect(lisEtatPartie({ ...e, ralentiPasse: [true, false] })).toBeNull();
  });
});

describe('arrivées, rôles et sièges', () => {
  it('un arrivant est indécis, sans siège par défaut ; un arrivant en cours de match regarde', () => {
    const e = nouvellePartie({ ...CONFIG, format: '2v2' }, 'LYNX 12', 'toulouse', A);
    arrive(e, 'ORQUE 7', B);
    expect(roleDe(e, B)).toEqual({ t: 'indecis' });
    expect(roleDe(e, A)).toEqual({ t: 'siege', siege: 0 });
    e.phase = 'match';
    arrive(e, 'FAUCON', C);
    expect(roleDe(e, C)).toEqual({ t: 'spect' });
    // on ne s'inscrit pas deux fois
    arrive(e, 'FAUCON', C);
    expect(e.spectateurs).toHaveLength(1);
  });

  it('chacun choisit son siège ; un siège pris ou inexistant est refusé', () => {
    const e = salle('1v2', { [B]: 2 });
    arrive(e, 'FAUCON', C);
    appliqueAction(e, C, { a: 'siege', siege: 2 }); // pris
    expect(roleDe(e, C)).toEqual({ t: 'indecis' });
    appliqueAction(e, C, { a: 'siege', siege: 1 }); // 1 contre 2 : pas de deuxième siège à gauche
    expect(roleDe(e, C)).toEqual({ t: 'indecis' });
    appliqueAction(e, C, { a: 'siege', siege: 3 });
    expect(roleDe(e, C)).toEqual({ t: 'siege', siege: 3 });
    expect(e.indecis).toHaveLength(0);
    expect(siegesLibres(e)).toEqual([]);
  });

  it('on peut changer de siège, ou passer spectateur, tant que la partie n’est pas lancée', () => {
    const e = salle('2v2', { [B]: 2 });
    appliqueAction(e, B, { a: 'siege', siege: 1 });
    expect(e.sieges[2]).toBeNull();
    expect(roleDe(e, B)).toEqual({ t: 'siege', siege: 1 });
    appliqueAction(e, B, { a: 'spectateur' });
    expect(e.sieges[1]).toBeNull();
    expect(roleDe(e, B)).toEqual({ t: 'spect' });
    appliqueAction(e, B, { a: 'siege', siege: 3 });
    expect(roleDe(e, B)).toEqual({ t: 'siege', siege: 3 });
    expect(e.spectateurs).toHaveLength(0);
  });

  it('l’hôte garde son siège, et le spectateur ne dépasse pas le plafond', () => {
    const e = salle('2v2');
    appliqueAction(e, A, { a: 'spectateur' });
    appliqueAction(e, A, { a: 'siege', siege: 3 });
    expect(roleDe(e, A)).toEqual({ t: 'siege', siege: 0 });
    for (let i = 0; i < SPECTATEURS_MAX; i++) {
      const id = `${i}`.padStart(16, 'a');
      arrive(e, `S${i}`, id);
      appliqueAction(e, id, { a: 'spectateur' });
    }
    expect(e.spectateurs).toHaveLength(SPECTATEURS_MAX);
  });

  it('pas de changement de siège une fois la partie lancée', () => {
    const e = salle('2v2', { [B]: 2 });
    arrive(e, 'FAUCON', C);
    appliqueAction(e, A, { a: 'lancer' });
    expect(e.phase).toBe('equipes');
    // l’indécis qui n’a pas choisi regarde
    expect(roleDe(e, C)).toEqual({ t: 'spect' });
    appliqueAction(e, C, { a: 'siege', siege: 1 });
    expect(roleDe(e, C)).toEqual({ t: 'spect' });
    appliqueAction(e, B, { a: 'spectateur' });
    expect(roleDe(e, B)).toEqual({ t: 'siege', siege: 2 });
  });

  it('le format est réservé à l’hôte ; les sièges qui disparaissent sont libérés', () => {
    const e = salle('2v2', { [B]: 2, [C]: 3, [D]: 1 });
    appliqueAction(e, B, { a: 'format', format: 'coop' });
    expect(e.config.format).toBe('2v2');
    appliqueAction(e, A, { a: 'format', format: '2v1' });
    expect(e.config.format).toBe('2v1');
    // le second siège de droite n'existe plus : son joueur doit rechoisir
    expect(e.sieges[3]).toBeNull();
    expect(roleDe(e, C)).toEqual({ t: 'indecis' });
    expect(roleDe(e, B)).toEqual({ t: 'siege', siege: 2 });
    expect(roleDe(e, D)).toEqual({ t: 'siege', siege: 1 });
    appliqueAction(e, A, { a: 'format', format: 'coop' });
    expect(roleDe(e, B)).toEqual({ t: 'indecis' });
    expect(roleDe(e, D)).toEqual({ t: 'siege', siege: 1 });
    expect(siegesLibres(e)).toEqual([]);
  });

  it('on peut lancer quand il y a quelqu’un en face, ou le coéquipier en coop', () => {
    expect(peutLancer(salle('2v2'))).toBe(false);
    expect(peutLancer(salle('2v2', { [C]: 1 }))).toBe(false);
    expect(peutLancer(salle('2v2', { [B]: 3 }))).toBe(true);
    expect(peutLancer(salle('coop'))).toBe(false);
    expect(peutLancer(salle('coop', { [B]: 1 }))).toBe(true);
    const e = salle('1v2', { [B]: 3 });
    appliqueAction(e, A, { a: 'lancer' });
    expect(e.phase).toBe('equipes');
  });

  it('la composition humaine vient des sièges occupés, et les rangs du simulateur aussi', () => {
    const e = salle('2v2', { [B]: 3 });
    expect(compositionHumaine(e)).toEqual({ humains: [true, true], duo: [false, false] });
    // un humain seul est toujours le rang 0 du simulateur, même assis au second siège
    expect(siegeReel(e, 1, 0)).toBe(3);
    expect(siegeReel(e, 1, 1)).toBeNull();
    expect(siegeReel(e, 0, 0)).toBe(0);
    arrive(e, 'FAUCON', C);
    appliqueAction(e, C, { a: 'siege', siege: 1 });
    expect(compositionHumaine(e).duo).toEqual([true, false]);
    expect(siegeReel(e, 0, 1)).toBe(1);
  });
});

describe('formats à plusieurs : l’hôte règle tout et valide seul', () => {
  function enChoix(): EtatPartieLan {
    const e = salle('2v2', { [B]: 1, [C]: 2, [D]: 3 });
    appliqueAction(e, A, { a: 'lancer' });
    return e;
  }

  it('seul l’hôte règle équipes et maillots, des deux camps', () => {
    const e = enChoix();
    appliqueAction(e, B, { a: 'equipe', equipe: 'nice' });
    appliqueAction(e, C, { a: 'equipe', equipe: 'nice' });
    expect(e.camps.map((c) => c.equipe)).toEqual(['toulouse', 'toulouse']);
    appliqueAction(e, A, { a: 'equipe', equipe: 'nice' });
    appliqueAction(e, A, { a: 'equipe', equipe: 'rouen', camp: 1 });
    expect(e.camps.map((c) => c.equipe)).toEqual(['nice', 'rouen']);
    // une équipe inconnue est refusée
    appliqueAction(e, A, { a: 'equipe', equipe: 'zzz', camp: 1 }, () => false);
    expect(e.camps[1].equipe).toBe('rouen');
  });

  it('seul l’hôte valide : tous les joueurs suivent', () => {
    const e = enChoix();
    appliqueAction(e, B, { a: 'pret', pret: true });
    expect(e.sieges.some((j) => j?.pret)).toBe(false);
    appliqueAction(e, A, { a: 'equipe', equipe: 'nice', camp: 1 });
    appliqueAction(e, A, { a: 'pret', pret: true });
    expect(e.phase).toBe('maillots');
    appliqueAction(e, A, { a: 'variante', variante: 'exterieur', camp: 1 });
    expect(e.camps[1].variante).toBe('exterieur');
    expect(appliqueAction(e, A, { a: 'pret', pret: true })).toBe(true);
    expect(e.phase).toBe('match');
  });

  it('même équipe et même maillot des deux côtés : l’hôte ne peut pas valider', () => {
    const e = enChoix();
    appliqueAction(e, A, { a: 'pret', pret: true });
    appliqueAction(e, A, { a: 'variante', variante: 'interieur', camp: 1 });
    expect(appliqueAction(e, A, { a: 'pret', pret: true })).toBe(false);
    expect(e.phase).toBe('maillots');
  });

  it('en fin de match, tous les joueurs doivent voter pareil', () => {
    const e = enChoix();
    e.phase = 'match';
    versFin(e);
    for (const id of [A, B, C]) expect(appliqueAction(e, id, { a: 'vote', vote: 'rejouer' })).toBe(false);
    expect(appliqueAction(e, D, { a: 'vote', vote: 'equipes' })).toBe(false);
    expect(appliqueAction(e, D, { a: 'vote', vote: 'rejouer' })).toBe(true);
    expect(e.phase).toBe('match');
    expect(e.sieges.every((j) => !j?.vote)).toBe(true);
  });

  it('le handicap est réservé à l’hôte', () => {
    const e = salle('2v2', { [B]: 2 });
    appliqueAction(e, B, { a: 'bonus', camp: 1, bonus: 'tir' });
    expect(e.bonus).toEqual(['aucun', 'aucun']);
    appliqueAction(e, A, { a: 'bonus', camp: 1, bonus: 'tir' });
    expect(e.bonus).toEqual(['aucun', 'tir']);
  });

  it('le ralenti s’arrête quand tous les joueurs assis ont passé', () => {
    const e = salle('2v2', { [B]: 1, [C]: 2 });
    e.phase = 'match';
    appliqueAction(e, A, { a: 'passer' });
    appliqueAction(e, B, { a: 'passer' });
    expect(tousOntPasse(e)).toBe(false);
    appliqueAction(e, C, { a: 'passer' });
    expect(tousOntPasse(e)).toBe(true);
  });
});

describe('coupures en cours de partie', () => {
  it('coupure en plein match : siège gardé, match figé, reprise au retour', () => {
    const e = partieADeux();
    e.phase = 'match';
    expect(joueurAbsent(e, 2, 60)).toBe(true);
    expect(e.sieges[2]).not.toBeNull();
    expect(e.absent).toBe(60);
    expect(e.absents).toEqual([2]);
    expect(e.pause).toBe(2);
    expect(matchFige(e)).toBe(true);
    // personne ne relance le match tant que le joueur est absent
    appliqueAction(e, A, { a: 'pause', on: false });
    expect(e.pause).toBe(2);
    // on ne diffuse qu'au changement de la seconde affichée
    expect(avanceAbsence(e, 0.5)).toBe('rien');
    expect(avanceAbsence(e, 0.6)).toBe('change');
    joueurRevenu(e, 2);
    expect(e.absent).toBe(0);
    expect(e.pause).toBeNull();
    expect(e.reprise).toBe(REPRISE_S);
    expect(avanceReprise(e, REPRISE_S)).toBe(true);
    expect(matchFige(e)).toBe(false);
  });

  it('deux absents : le match ne reprend que quand les deux sont revenus', () => {
    const e = salle('2v2', { [B]: 1, [C]: 2, [D]: 3 });
    e.phase = 'match';
    expect(joueurAbsent(e, 1, 60)).toBe(true);
    expect(joueurAbsent(e, 3, 60)).toBe(true);
    expect(e.absents).toEqual([1, 3]);
    joueurRevenu(e, 1);
    expect(e.absent).toBe(60);
    expect(e.pause).not.toBeNull();
    joueurRevenu(e, 3);
    expect(e.absent).toBe(0);
    expect(e.absents).toEqual([]);
    expect(e.pause).toBeNull();
    expect(e.reprise).toBe(REPRISE_S);
  });

  it('délai écoulé : on retourne en salle d’attente, les sièges perdus sont libérés', () => {
    const e = salle('2v2', { [B]: 1, [C]: 2 });
    e.phase = 'fin';
    expect(joueurAbsent(e, 2, 2)).toBe(true);
    expect(e.pause).toBeNull();
    expect(avanceAbsence(e, 1.5)).toBe('change');
    expect(avanceAbsence(e, 1)).toBe('fini');
    versAttente(e);
    expect(e.phase).toBe('attente');
    expect(e.sieges[2]).toBeNull();
    expect(roleDe(e, B)).toEqual({ t: 'siege', siege: 1 });
    expect(e.absent).toBe(0);
    expect(e.absents).toEqual([]);
  });

  it('en salle d’attente, le siège n’est pas gardé ; l’hôte ne peut pas être absent', () => {
    const s = partieADeux();
    expect(joueurAbsent(s, 2)).toBe(false);
    expect(s.absent).toBe(0);
    s.phase = 'match';
    expect(joueurAbsent(s, 0)).toBe(false);
  });

  it('valide les actions reçues : les actions de l’hôte ne passent pas par le réseau', () => {
    expect(lisAction({ a: 'lancer' })).toBeNull();
    expect(lisAction({ a: 'format', format: 'coop' })).toBeNull();
    expect(lisAction({ a: 'bonus', camp: 1, bonus: 'tir' })).toBeNull();
    expect(lisAction({ a: 'siege', siege: 3 })).toEqual({ a: 'siege', siege: 3 });
    expect(lisAction({ a: 'siege', siege: 4 })).toBeNull();
    expect(lisAction({ a: 'spectateur' })).toEqual({ a: 'spectateur' });
    // le camp demandé ne voyage pas : seul l'hôte, lui-même, règle l'autre camp
    expect(lisAction({ a: 'equipe', equipe: 'nice', camp: 1 })).toEqual({ a: 'equipe', equipe: 'nice' });
  });
});
