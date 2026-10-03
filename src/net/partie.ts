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

import { NIVEAUX } from '@core/constants';
import { BONUS_EQUIPE, type BonusEquipe } from '@core/types';

export type VarianteMaillot = 'interieur' | 'exterieur';
export type PhaseLan = 'attente' | 'equipes' | 'maillots' | 'match' | 'fin';
export type VoteFin = 'rejouer' | 'equipes';
/** Un camp : 0 = l'équipe de gauche (celle de l'hôte), 1 = celle de droite. */
export type Camp = 0 | 1;
/** Un siège : 0 = A1 (l'hôte), 1 = A2, 2 = B1, 3 = B2. */
export type Siege = 0 | 1 | 2 | 3;

export const SIEGES: readonly Siege[] = [0, 1, 2, 3];
export const campDe = (s: Siege): Camp => (s >> 1) as Camp;
export const rangDe = (s: Siege): 0 | 1 => (s & 1) as 0 | 1;
export const siegeDeCamp = (camp: Camp, rang: 0 | 1): Siege => ((camp << 1) | rang) as Siege;

/** Spectateurs (et indécis) au plus par partie : c'est l'appareil de l'hôte qui leur envoie le match. */
export const SPECTATEURS_MAX = 8;

/** Formats de la partie : combien d'humains de chaque côté (le CPU tient les autres places). */
export const FORMATS = ['1v1', '2v1', '1v2', '2v2', 'coop'] as const;
export type FormatLan = (typeof FORMATS)[number];
export const estFormat = (x: unknown): x is FormatLan => FORMATS.includes(x as FormatLan);
/** Humains par camp : `coop` = deux humains d'un côté, le CPU en face. */
export const PLACES_FORMAT: Record<FormatLan, [number, number]> = {
  '1v1': [1, 1],
  '2v1': [2, 1],
  '1v2': [1, 2],
  '2v2': [2, 2],
  coop: [2, 0],
};
/** Le siège existe-t-il dans ce format ? */
export const siegeExiste = (format: FormatLan, s: Siege): boolean => rangDe(s) < PLACES_FORMAT[format][campDe(s)];

/**
 * Réactions des spectateurs (et des joueurs sur l'écran de fin) : les deux
 * logos des équipes du match, toujours présents, puis quatre icônes.
 */
export const REACTIONS = ['logo0', 'logo1', 'feu', 'gyro', 'coeur', 'ouf'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const estReaction = (x: unknown): x is Reaction => REACTIONS.includes(x as Reaction);

/** Un appareil connecté à la partie (joueur, spectateur ou indécis). */
export interface MembreLan {
  nom: string;
  /** Identifiant stable de l'appareil (historique des duels), jamais publié hors de la liaison chiffrée. */
  appareil: string;
}

/** Un joueur assis. */
export interface JoueurLan extends MembreLan {
  pret: boolean;
  vote: VoteFin | null;
}

/** L'équipe d'un camp et son maillot. */
export interface CampLan {
  equipe: string;
  variante: VarianteMaillot;
}

export interface ConfigLan {
  effectif: number;
  duree: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  /** Ralenti des buts sur tous les écrans. */
  ralenti: boolean;
  /** Bonus (power-ups) en jeu. */
  pouvoirs: boolean;
  /** Combien d'humains de chaque côté (voir `PLACES_FORMAT`). */
  format: FormatLan;
  /** Niveau du CPU en coop (index dans NIVEAUX) ; ignoré dans les autres formats. */
  niveau: number;
}

export interface EtatPartieLan {
  phase: PhaseLan;
  config: ConfigLan;
  /** Équipe et maillot des deux camps. */
  camps: [CampLan, CampLan];
  /** Les quatre sièges (A1, A2, B1, B2) ; l'hôte occupe toujours le premier. */
  sieges: [JoueurLan | null, JoueurLan | null, JoueurLan | null, JoueurLan | null];
  /** Appareils qui regardent la partie. */
  spectateurs: MembreLan[];
  /** Appareils arrivés, qui n'ont pas encore choisi entre jouer et regarder. */
  indecis: MembreLan[];
  /** Joueur qui a mis le match en pause (la pause vaut pour tous les écrans). */
  pause: Siege | null;
  /** Secondes restantes du compte à rebours de reprise (0 = aucun). */
  reprise: number;
  /** Handicap de chaque camp, réglé par l'hôte (validé par les autres en appuyant sur PRÊT). */
  bonus: [BonusEquipe, BonusEquipe];
  /** Qui a demandé à passer le ralenti du but en cours (il s'arrête quand tous les humains ont passé). */
  ralentiPasse: [boolean, boolean, boolean, boolean];
  /**
   * Connexion perdue avec des joueurs : secondes qu'il leur reste pour revenir
   * (0 = tout le monde est là). Leurs sièges sont gardés (`absents`), le match est en pause.
   */
  absent: number;
  absents: Siege[];
}

export type ActionLan =
  /** Réservé à l'hôte : fermer la salle d'attente et passer aux équipes. */
  | { a: 'lancer' }
  /** Réservé à l'hôte : le format de la partie. */
  | { a: 'format'; format: FormatLan }
  /** Prendre un siège libre (salle d'attente). */
  | { a: 'siege'; siege: Siege }
  /** Choisir de regarder (salle d'attente) ; libère le siège éventuel. */
  | { a: 'spectateur' }
  /** `camp` : le camp à régler (hôte seulement, hors 1 contre 1) ; sinon le sien. */
  | { a: 'equipe'; equipe: string; camp?: Camp }
  | { a: 'variante'; variante: VarianteMaillot; camp?: Camp }
  | { a: 'pret'; pret: boolean }
  | { a: 'vote'; vote: VoteFin | null }
  | { a: 'pause'; on: boolean }
  /** Réservé à l'hôte : handicap d'un des deux camps. */
  | { a: 'bonus'; camp: Camp; bonus: BonusEquipe }
  | { a: 'passer' };

export const REPRISE_S = 3;
/** Temps laissé aux joueurs pour se reconnecter après une coupure (s). */
export const RECONNEXION_S = 60;

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

// ----------------------------------------------------------------- rôles --

export type Role = { t: 'siege'; siege: Siege } | { t: 'spect' } | { t: 'indecis' };

export function siegeDeAppareil(e: EtatPartieLan, appareil: string): Siege | null {
  const s = SIEGES.find((i) => e.sieges[i]?.appareil === appareil);
  return s ?? null;
}

export function roleDe(e: EtatPartieLan, appareil: string): Role | null {
  const s = siegeDeAppareil(e, appareil);
  if (s !== null) return { t: 'siege', siege: s };
  if (e.spectateurs.some((m) => m.appareil === appareil)) return { t: 'spect' };
  if (e.indecis.some((m) => m.appareil === appareil)) return { t: 'indecis' };
  return null;
}

/** Les joueurs assis de ce camp. */
export const joueursDuCamp = (e: EtatPartieLan, camp: Camp): JoueurLan[] =>
  [siegeDeCamp(camp, 0), siegeDeCamp(camp, 1)].map((s) => e.sieges[s]).filter((j): j is JoueurLan => !!j);

/** Tous les joueurs assis. */
export const joueursAssis = (e: EtatPartieLan): JoueurLan[] => e.sieges.filter((j): j is JoueurLan => !!j);

/** Sièges libres du format (rien à prendre quand la partie est lancée). */
export function siegesLibres(e: EtatPartieLan): Siege[] {
  if (e.phase !== 'attente') return [];
  return SIEGES.filter((s) => siegeExiste(e.config.format, s) && !e.sieges[s]);
}

/** Spectateurs et indécis : ceux que l'hôte doit alimenter sans qu'ils jouent. */
export const nbRegardeurs = (e: EtatPartieLan): number => e.spectateurs.length + e.indecis.length;

/** Un seul humain par camp décide-t-il de tout (hôte seul) ? Seul le 1 contre 1 laisse chacun choisir son équipe. */
export const hoteChoisit = (c: ConfigLan): boolean => c.format !== '1v1';

/** Le match peut-il être lancé ? Il faut au moins un humain en face, sauf en coop (le CPU est en face). */
export function peutLancer(e: EtatPartieLan): boolean {
  if (e.phase !== 'attente') return false;
  return e.config.format === 'coop' ? joueursDuCamp(e, 0).length >= 2 : joueursDuCamp(e, 1).length >= 1;
}

/** Réglage du match tel que le simulateur le veut : humains et duos de chaque camp, d'après les sièges occupés. */
export function compositionHumaine(e: EtatPartieLan): { humains: [boolean, boolean]; duo: [boolean, boolean] } {
  const n0 = joueursDuCamp(e, 0).length;
  const n1 = joueursDuCamp(e, 1).length;
  return { humains: [n0 >= 1, n1 >= 1], duo: [n0 >= 2, n1 >= 2] };
}

/**
 * Siège réel du joueur que le simulateur appelle (camp, rang dans l'équipe) :
 * dans une équipe à deux humains, le rang est le leur ; seul, un humain est
 * toujours le rang 0 du simulateur, quel que soit son siège.
 */
export function siegeReel(e: EtatPartieLan, camp: Camp, rangCore: 0 | 1): Siege | null {
  const assis = [siegeDeCamp(camp, 0), siegeDeCamp(camp, 1)].filter((s) => e.sieges[s]);
  if (assis.length >= 2) return assis[rangCore] ?? null;
  return rangCore === 0 ? (assis[0] ?? null) : null;
}

/** Le rang dans le simulateur (0 : `controles`, 1 : `partenaires`) d'un siège donné. */
export function rangCore(e: EtatPartieLan, s: Siege): 0 | 1 {
  return joueursDuCamp(e, campDe(s)).length >= 2 ? rangDe(s) : 0;
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

// ------------------------------------------------------------- validation --

const NOM_SUR = /^[A-Z0-9 ]{1,14}$/;
export const APPAREIL_SUR = /^[0-9a-f]{16}$/;
const estBonus = (x: unknown): x is BonusEquipe => BONUS_EQUIPE.includes(x as BonusEquipe);
const EQUIPE_SURE = /^[a-z]{2,16}$/;
const PHASES: PhaseLan[] = ['attente', 'equipes', 'maillots', 'match', 'fin'];
const estVariante = (x: unknown): x is VarianteMaillot => x === 'interieur' || x === 'exterieur';
const estVote = (x: unknown): x is VoteFin | null => x === null || x === 'rejouer' || x === 'equipes';
const entier = (x: unknown, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max;
const estSiege = (x: unknown): x is Siege => entier(x, 3);

function lisMembre(o: unknown): MembreLan | null {
  if (!o || typeof o !== 'object') return null;
  const m = o as Record<string, unknown>;
  if (typeof m.nom !== 'string' || !NOM_SUR.test(m.nom)) return null;
  if (typeof m.appareil !== 'string' || !APPAREIL_SUR.test(m.appareil)) return null;
  return { nom: m.nom, appareil: m.appareil };
}

function lisJoueur(o: unknown): JoueurLan | null {
  const m = lisMembre(o);
  if (!m) return null;
  const j = o as Record<string, unknown>;
  if (typeof j.pret !== 'boolean' || !estVote(j.vote)) return null;
  return { ...m, pret: j.pret, vote: j.vote as VoteFin | null };
}

function lisCamp(o: unknown): CampLan | null {
  if (!o || typeof o !== 'object') return null;
  const c = o as Record<string, unknown>;
  if (typeof c.equipe !== 'string' || !EQUIPE_SURE.test(c.equipe) || !estVariante(c.variante)) return null;
  return { equipe: c.equipe, variante: c.variante };
}

function lisMembres(o: unknown): MembreLan[] | null {
  if (!Array.isArray(o) || o.length > SPECTATEURS_MAX) return null;
  const l = o.map(lisMembre);
  return l.every((m) => m) ? (l as MembreLan[]) : null;
}

export function lisConfig(o: unknown): ConfigLan | null {
  if (!o || typeof o !== 'object') return null;
  const c = o as Record<string, unknown>;
  if (!entier(c.effectif, 9) || !entier(c.duree, 9)) return null;
  if (typeof c.assistTir !== 'boolean' || typeof c.assistPasse !== 'boolean' || typeof c.changementAuto !== 'boolean') return null;
  if (typeof c.ralenti !== 'boolean' || typeof c.pouvoirs !== 'boolean' || !estFormat(c.format)) return null;
  if (!entier(c.niveau, NIVEAUX.length - 1)) return null;
  return {
    effectif: c.effectif,
    duree: c.duree,
    assistTir: c.assistTir,
    assistPasse: c.assistPasse,
    changementAuto: c.changementAuto,
    ralenti: c.ralenti,
    pouvoirs: c.pouvoirs,
    format: c.format,
    niveau: c.niveau,
  };
}

/** Valide l'état diffusé par l'hôte (côté client). */
export function lisEtatPartie(o: unknown): EtatPartieLan | null {
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (!PHASES.includes(e.phase as PhaseLan)) return null;
  const config = lisConfig(e.config);
  if (!config) return null;
  if (!Array.isArray(e.camps) || e.camps.length !== 2) return null;
  const c0 = lisCamp(e.camps[0]);
  const c1 = lisCamp(e.camps[1]);
  if (!c0 || !c1) return null;
  const brut = e.sieges;
  if (!Array.isArray(brut) || brut.length !== 4) return null;
  const sieges = brut.map((s) => (s === null ? null : lisJoueur(s)));
  if (!sieges[0] || sieges.some((s, i) => brut[i] !== null && !s)) return null;
  const spectateurs = lisMembres(e.spectateurs);
  const indecis = lisMembres(e.indecis);
  if (!spectateurs || !indecis) return null;
  if (!(e.pause === null || estSiege(e.pause))) return null;
  if (typeof e.reprise !== 'number' || !(e.reprise >= 0 && e.reprise <= REPRISE_S)) return null;
  const b = e.bonus;
  const rp = e.ralentiPasse;
  if (!Array.isArray(b) || b.length !== 2 || !b.every(estBonus)) return null;
  if (!Array.isArray(rp) || rp.length !== 4 || !rp.every((x) => typeof x === 'boolean')) return null;
  if (typeof e.absent !== 'number' || !(e.absent >= 0 && e.absent <= 600)) return null;
  if (!Array.isArray(e.absents) || e.absents.length > 3 || !e.absents.every(estSiege)) return null;
  return {
    phase: e.phase as PhaseLan,
    config,
    camps: [c0, c1],
    sieges: sieges as EtatPartieLan['sieges'],
    spectateurs,
    indecis,
    pause: e.pause,
    reprise: e.reprise,
    bonus: [b[0] as BonusEquipe, b[1] as BonusEquipe],
    ralentiPasse: rp as EtatPartieLan['ralentiPasse'],
    absent: e.absent,
    absents: [...(e.absents as Siege[])],
  };
}

/** Valide une action reçue d'un client (côté hôte). */
export function lisAction(o: unknown): ActionLan | null {
  if (!o || typeof o !== 'object') return null;
  const a = o as Record<string, unknown>;
  switch (a.a) {
    case 'siege':
      return estSiege(a.siege) ? { a: 'siege', siege: a.siege } : null;
    case 'spectateur':
      return { a: 'spectateur' };
    case 'equipe':
      return typeof a.equipe === 'string' && EQUIPE_SURE.test(a.equipe) ? { a: 'equipe', equipe: a.equipe } : null;
    case 'variante':
      return estVariante(a.variante) ? { a: 'variante', variante: a.variante } : null;
    case 'pret':
      return typeof a.pret === 'boolean' ? { a: 'pret', pret: a.pret } : null;
    case 'vote':
      return estVote(a.vote) ? { a: 'vote', vote: a.vote } : null;
    case 'pause':
      return typeof a.on === 'boolean' ? { a: 'pause', on: a.on } : null;
    case 'passer':
      return { a: 'passer' };
    default:
      // « lancer », « format » et « bonus » sont réservés à l'hôte : jamais acceptés du réseau
      return null;
  }
}
