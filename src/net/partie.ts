/**
 * Déroulé d'une partie Wi-Fi, arbitré par l'hôte :
 *
 *   attente ──LANCER──▶ equipes ──prêts──▶ maillots ──prêts──▶ match ──▶ fin
 *      ▲                   ▲                                       ▲        │
 *      └─ joueur parti     └──────── votes « équipes » ────────────┴─ votes « rejouer »
 *
 * Quatre sièges (A1 = l'hôte, A2, B1, B2) et des spectateurs : en salle
 * d'attente, chaque arrivant choisit de jouer (sur un siège libre du format
 * choisi par l'hôte) ou de regarder. Le format dit combien d'humains jouent
 * de chaque côté (1 contre 1, 2 contre 1, 1 contre 2, 2 contre 2, coop) ; les
 * sièges vides sont tenus par le CPU.
 *
 * Connexion perdue avec un joueur hors de la salle d'attente : son siège lui
 * est réservé `RECONNEXION_S` secondes (`absents`), le match est figé ; s'il
 * revient (même jeton secret), on reprend là où on en était, sinon sa place
 * est libérée et on retourne en salle d'attente.
 *
 * Équipes et maillots : en 1 contre 1, chaque joueur choisit les siens ;
 * dans tous les autres formats, l'hôte règle les deux camps et valide seul.
 * Les votes de fin de match, eux, sont ceux de tous les joueurs assis.
 *
 * Module pur (aucun réseau, aucun DOM) : l'hôte applique ici ses actions et
 * celles reçues des clients, puis diffuse l'état obtenu.
 */

import { campDe, RECONNEXION_S, REPRISE_S, SIEGES, siegeExiste, SPECTATEURS_MAX, type ActionLan, type Camp, type ConfigLan, type EtatPartieLan, type FormatLan, type Siege } from './partie-modele';
import { hoteChoisit, joueursAssis, peutLancer, roleDe, siegeDeAppareil, siegesLibres } from './sieges';

export function nouvellePartie(config: ConfigLan, nom: string, equipe: string, appareil: string): EtatPartieLan {
  return {
    phase: 'attente',
    config: { ...config },
    camps: [
      { equipe, variante: 'interieur' },
      { equipe, variante: 'interieur' },
    ],
    sieges: [{ nom, appareil, pret: false, vote: null }, null, null, null],
    spectateurs: [],
    indecis: [],
    pause: null,
    reprise: 0,
    bonus: ['aucun', 'aucun'],
    ralentiPasse: [false, false, false, false],
    absent: 0,
    absents: [],
  };
}

// -------------------------------------------------------------- arrivées --

/** Un appareil arrive : indécis en salle d'attente, spectateur d'office ensuite (les sièges sont pris). */
export function arrive(e: EtatPartieLan, nom: string, appareil: string): void {
  if (roleDe(e, appareil)) return;
  (e.phase === 'attente' ? e.indecis : e.spectateurs).push({ nom, appareil });
}

/** Un regardeur (indécis ou spectateur) s'en va. */
export function regardeurPart(e: EtatPartieLan, appareil: string): void {
  e.spectateurs = e.spectateurs.filter((m) => m.appareil !== appareil);
  e.indecis = e.indecis.filter((m) => m.appareil !== appareil);
}

function remetPrets(e: EtatPartieLan): void {
  for (const j of joueursAssis(e)) {
    j.pret = false;
    j.vote = null;
  }
}

/** Un joueur quitte son siège pour de bon (en salle d'attente, ou après sa période de grâce). */
export function joueurPart(e: EtatPartieLan, s: Siege): void {
  if (s === 0) return;
  e.sieges[s] = null;
  e.absents = e.absents.filter((x) => x !== s);
  if (!e.absents.length) e.absent = 0;
  e.ralentiPasse[s] = false;
  if (e.phase === 'attente') remetPrets(e);
}

/**
 * Retour en salle d'attente : les sièges des joueurs perdus sont libérés,
 * les autres joueurs gardent le leur.
 */
export function versAttente(e: EtatPartieLan): void {
  for (const s of e.absents) if (s !== 0) e.sieges[s] = null;
  e.absents = [];
  e.absent = 0;
  e.phase = 'attente';
  e.pause = null;
  e.reprise = 0;
  e.ralentiPasse = [false, false, false, false];
  remetPrets(e);
}

/** Un but vient d'être marqué : personne n'a encore passé son ralenti. */
export function debutRalenti(e: EtatPartieLan): void {
  e.ralentiPasse = [false, false, false, false];
}

/** Tous les humains assis ont-ils passé le ralenti ? */
export function tousOntPasse(e: EtatPartieLan): boolean {
  const assis = SIEGES.filter((s) => e.sieges[s]);
  return assis.length > 0 && assis.every((s) => e.ralentiPasse[s]);
}

/**
 * La connexion avec un joueur vient de tomber : en salle d'attente, il part
 * (rien à perdre) ; ailleurs, son siège lui est gardé `delai` secondes et le
 * match se fige. Renvoie true si le siège est gardé.
 */
export function joueurAbsent(e: EtatPartieLan, s: Siege, delai = RECONNEXION_S): boolean {
  if (!e.sieges[s] || e.phase === 'attente' || s === 0) return false;
  if (!e.absents.includes(s)) e.absents.push(s);
  e.absent = delai;
  if (e.phase === 'match') {
    e.pause = s;
    e.reprise = 0;
  }
  return true;
}

/** Le joueur est revenu : quand tous le sont, le match reprend après le compte à rebours habituel. */
export function joueurRevenu(e: EtatPartieLan, s: Siege): void {
  e.absents = e.absents.filter((x) => x !== s);
  if (e.absents.length) return;
  e.absent = 0;
  if (e.phase === 'match') {
    e.pause = null;
    e.reprise = REPRISE_S;
  }
}

/**
 * Fait avancer l'attente des joueurs absents. Renvoie 'change' quand la
 * seconde affichée change (à diffuser), 'fini' quand le délai est écoulé.
 */
export function avanceAbsence(e: EtatPartieLan, dt: number): 'rien' | 'change' | 'fini' {
  if (e.absent <= 0) return 'rien';
  const avant = Math.ceil(e.absent);
  e.absent = Math.max(0, e.absent - dt);
  if (e.absent === 0) return 'fini';
  return Math.ceil(e.absent) !== avant ? 'change' : 'rien';
}

/** Même équipe et même maillot des deux côtés : on ne distinguerait plus les deux camps. */
export function maillotsIdentiques(e: EtatPartieLan): boolean {
  const [a, b] = e.camps;
  return a.equipe === b.equipe && a.variante === b.variante;
}

function versEquipes(e: EtatPartieLan): void {
  e.phase = 'equipes';
  remetPrets(e);
}

export function versFin(e: EtatPartieLan): void {
  e.phase = 'fin';
  e.pause = null;
  e.reprise = 0;
  remetPrets(e);
}

/** Change le format : les sièges qui n'existent plus sont libérés (leurs joueurs doivent rechoisir). */
function changeFormat(e: EtatPartieLan, format: FormatLan): void {
  e.config.format = format;
  for (const s of SIEGES) {
    const j = e.sieges[s];
    if (j && s !== 0 && !siegeExiste(format, s)) {
      e.sieges[s] = null;
      e.indecis.push({ nom: j.nom, appareil: j.appareil });
    }
  }
  remetPrets(e);
}

/**
 * Applique l'action d'un appareil (identifié par `appareil`). Renvoie `true`
 * si elle déclenche le début d'un match (tous ont validé leurs maillots, ou
 * voté « rejouer »). Toute action hors de propos (mauvaise phase, choix
 * verrouillé, pas son tour...) est simplement ignorée.
 */
export function appliqueAction(e: EtatPartieLan, appareil: string, action: ActionLan, equipeConnue: (id: string) => boolean = () => true): boolean {
  const mon = siegeDeAppareil(e, appareil);
  const hote = mon === 0;
  const moi = mon === null ? null : e.sieges[mon]!;
  const auChoix = hoteChoisit(e.config);
  switch (action.a) {
    case 'lancer':
      if (hote && peutLancer(e)) {
        // ceux qui n'ont pas choisi regardent
        for (const m of e.indecis) e.spectateurs.push(m);
        e.indecis = [];
        versEquipes(e);
      }
      return false;
    case 'format':
      if (hote && e.phase === 'attente') changeFormat(e, action.format);
      return false;
    case 'siege': {
      if (e.phase !== 'attente' || hote) return false;
      const membre = moi ?? e.indecis.find((m) => m.appareil === appareil) ?? e.spectateurs.find((m) => m.appareil === appareil);
      if (!membre || !siegesLibres(e).includes(action.siege)) return false;
      if (mon !== null) e.sieges[mon] = null;
      regardeurPart(e, appareil);
      e.sieges[action.siege] = { nom: membre.nom, appareil: membre.appareil, pret: false, vote: null };
      remetPrets(e);
      return false;
    }
    case 'spectateur': {
      if (e.phase !== 'attente' || hote) return false;
      const membre = moi ?? e.indecis.find((m) => m.appareil === appareil);
      if (!membre) return false;
      if (e.spectateurs.length + e.indecis.length - (moi ? 0 : 1) >= SPECTATEURS_MAX) return false;
      if (mon !== null) {
        e.sieges[mon] = null;
        remetPrets(e);
      }
      regardeurPart(e, appareil);
      e.spectateurs.push({ nom: membre.nom, appareil: membre.appareil });
      return false;
    }
    case 'equipe':
    case 'variante': {
      if (!moi || moi.pret) return false;
      const attendue = action.a === 'equipe' ? 'equipes' : 'maillots';
      if (e.phase !== attendue) return false;
      // 1 contre 1 : chacun règle son camp ; sinon l'hôte règle les deux
      const camp: Camp | null = auChoix ? (hote ? (action.camp ?? 0) : null) : campDe(mon!);
      if (camp === null) return false;
      if (action.a === 'equipe') {
        if (equipeConnue(action.equipe)) e.camps[camp].equipe = action.equipe;
      } else {
        e.camps[camp].variante = action.variante;
      }
      return false;
    }
    case 'pret': {
      if (!moi || (e.phase !== 'equipes' && e.phase !== 'maillots')) return false;
      // hors 1 contre 1, seul l'hôte valide : les autres suivent
      if (auChoix && !hote) return false;
      const autres = joueursAssis(e).filter((j) => j !== moi);
      if (action.pret && e.phase === 'maillots' && (auChoix || autres.every((j) => j.pret)) && maillotsIdentiques(e)) return false;
      if (auChoix) for (const j of joueursAssis(e)) j.pret = action.pret;
      else moi.pret = action.pret;
      if (!joueursAssis(e).every((j) => j.pret)) return false;
      if (e.phase === 'equipes') {
        e.phase = 'maillots';
        e.camps[0].variante = 'interieur';
        // même club des deux côtés : le camp de droite part en maillot extérieur
        e.camps[1].variante = e.camps[0].equipe === e.camps[1].equipe ? 'exterieur' : 'interieur';
        remetPrets(e);
        return false;
      }
      if (maillotsIdentiques(e)) {
        remetPrets(e);
        return false;
      }
      e.phase = 'match';
      e.pause = null;
      e.reprise = 0;
      return true;
    }
    case 'vote': {
      if (!moi || e.phase !== 'fin') return false;
      moi.vote = action.vote;
      const tous = joueursAssis(e);
      const vote = moi.vote;
      if (!vote || !tous.every((j) => j.vote === vote)) return false;
      if (vote === 'equipes') {
        versEquipes(e);
        return false;
      }
      e.phase = 'match';
      for (const j of tous) j.vote = null;
      return true;
    }
    case 'bonus':
      if (hote && (e.phase === 'attente' || e.phase === 'equipes')) {
        e.bonus[action.camp] = action.bonus;
        // les autres doivent revalider en connaissant le nouveau handicap
        remetPrets(e);
      }
      return false;
    case 'passer':
      if (mon !== null && e.phase === 'match') e.ralentiPasse[mon] = true;
      return false;
    case 'pause':
      // pendant l'absence d'un joueur, la pause tient jusqu'à son retour
      if (mon === null || e.phase !== 'match' || e.absent > 0) return false;
      if (action.on) {
        e.pause = mon;
        e.reprise = 0;
      } else if (e.pause !== null) {
        e.pause = null;
        e.reprise = REPRISE_S;
      }
      return false;
  }
}

/** Le match est-il figé (pause, ou compte à rebours de reprise) ? */
export function matchFige(e: EtatPartieLan): boolean {
  return e.phase === 'match' && (e.pause !== null || e.reprise > 0);
}

/** Fait avancer le compte à rebours de reprise ; renvoie true quand il se termine. */
export function avanceReprise(e: EtatPartieLan, dt: number): boolean {
  if (e.reprise <= 0 || e.pause !== null) return false;
  e.reprise = Math.max(0, e.reprise - dt);
  return e.reprise === 0;
}

// le modèle, les sièges et la validation font partie de l'interface de ce module
export * from './partie-modele';
export * from './sieges';
export * from './partie-validation';
