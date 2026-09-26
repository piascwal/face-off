import { describe, expect, it } from 'vitest';
import {
  appliqueAction,
  avanceReprise,
  inviteArrive,
  invitePart,
  lisEtatPartie,
  matchFige,
  nouvellePartie,
  REPRISE_S,
  versFin,
  type EtatPartieLan,
} from '../src/net/partie';

const CONFIG = { effectif: 0, duree: 1, assistTir: true, assistPasse: false, changementAuto: true, ralenti: true };
const A = '0123456789abcdef';
const B = 'fedcba9876543210';

function partieADeux(): EtatPartieLan {
  const e = nouvellePartie(CONFIG, 'LYNX 12', 'toulouse', A);
  inviteArrive(e, 'ORQUE 7', 'nice', B);
  return e;
}

describe('partie Wi-Fi : on n’avance que quand les deux ont validé', () => {
  it('seul l’hôte lance, et seulement avec un invité', () => {
    const seul = nouvellePartie(CONFIG, 'LYNX 12', 'toulouse', A);
    appliqueAction(seul, 0, { a: 'lancer' });
    expect(seul.phase).toBe('attente');
    const e = partieADeux();
    appliqueAction(e, 1, { a: 'lancer' });
    expect(e.phase).toBe('attente');
    appliqueAction(e, 0, { a: 'lancer' });
    expect(e.phase).toBe('equipes');
  });

  it('équipes puis maillots, chacun ne touche qu’à son côté, verrouillé une fois prêt', () => {
    const e = partieADeux();
    appliqueAction(e, 0, { a: 'lancer' });
    appliqueAction(e, 1, { a: 'equipe', equipe: 'toulouse' });
    appliqueAction(e, 1, { a: 'pret', pret: true });
    appliqueAction(e, 1, { a: 'equipe', equipe: 'nice' }); // verrouillé
    expect(e.joueurs[1]!.equipe).toBe('toulouse');
    expect(e.joueurs[0].equipe).toBe('toulouse');
    expect(e.phase).toBe('equipes');
    appliqueAction(e, 0, { a: 'pret', pret: true });
    expect(e.phase).toBe('maillots');
    // même club : l'invité part en extérieur, et personne n'est encore prêt
    expect(e.joueurs[0].variante).toBe('interieur');
    expect(e.joueurs[1]!.variante).toBe('exterieur');
    expect(e.joueurs[0].pret || e.joueurs[1]!.pret).toBe(false);
  });

  it('refuse deux maillots identiques, démarre quand tout est bon', () => {
    const e = partieADeux();
    appliqueAction(e, 0, { a: 'lancer' });
    appliqueAction(e, 0, { a: 'equipe', equipe: 'nice' });
    appliqueAction(e, 0, { a: 'pret', pret: true });
    appliqueAction(e, 1, { a: 'pret', pret: true });
    expect(e.phase).toBe('maillots');
    appliqueAction(e, 1, { a: 'variante', variante: 'interieur' });
    appliqueAction(e, 1, { a: 'variante', variante: 'interieur' });
    appliqueAction(e, 0, { a: 'pret', pret: true });
    expect(e.joueurs[1]!.variante).toBe('interieur');
    expect(appliqueAction(e, 1, { a: 'pret', pret: true })).toBe(false);
    expect(e.joueurs[1]!.pret).toBe(false);
    appliqueAction(e, 1, { a: 'variante', variante: 'exterieur' });
    expect(appliqueAction(e, 1, { a: 'pret', pret: true })).toBe(true);
    expect(e.phase).toBe('match');
  });

  it('MODIFIER annule son « prêt »', () => {
    const e = partieADeux();
    appliqueAction(e, 0, { a: 'lancer' });
    appliqueAction(e, 0, { a: 'pret', pret: true });
    appliqueAction(e, 0, { a: 'pret', pret: false });
    appliqueAction(e, 1, { a: 'pret', pret: true });
    expect(e.phase).toBe('equipes');
  });

  it('la pause vaut pour les deux, la reprise passe par un compte à rebours', () => {
    const e = partieADeux();
    e.phase = 'match';
    appliqueAction(e, 1, { a: 'pause', on: true });
    expect(e.pause).toBe(1);
    expect(matchFige(e)).toBe(true);
    appliqueAction(e, 0, { a: 'pause', on: false });
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
    expect(appliqueAction(e, 0, { a: 'vote', vote: 'rejouer' })).toBe(false);
    expect(appliqueAction(e, 1, { a: 'vote', vote: 'equipes' })).toBe(false);
    expect(e.phase).toBe('fin');
    expect(appliqueAction(e, 1, { a: 'vote', vote: 'rejouer' })).toBe(true);
    expect(e.phase).toBe('match');
    versFin(e);
    appliqueAction(e, 0, { a: 'vote', vote: 'equipes' });
    appliqueAction(e, 1, { a: 'vote', vote: 'equipes' });
    expect(e.phase).toBe('equipes');
    expect(e.joueurs[0].pret).toBe(false);
  });

  it('le départ de l’invité ramène en salle d’attente', () => {
    const e = partieADeux();
    e.phase = 'match';
    e.pause = 0;
    invitePart(e);
    expect(e.phase).toBe('attente');
    expect(e.joueurs[1]).toBeNull();
    expect(e.pause).toBeNull();
  });

  it('valide l’état reçu (aller-retour JSON) et rejette un état truqué', () => {
    const e = partieADeux();
    expect(lisEtatPartie(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(lisEtatPartie({ ...e, phase: 'triche' })).toBeNull();
    expect(lisEtatPartie({ ...e, reprise: 99 })).toBeNull();
    expect(lisEtatPartie({ ...e, joueurs: [e.joueurs[0], { ...e.joueurs[1], nom: '<b>' }] })).toBeNull();
  });
});
