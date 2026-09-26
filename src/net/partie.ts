/**
 * Déroulé d'une partie Wi-Fi, arbitré par l'hôte :
 *
 *   attente ──LANCER──▶ equipes ──2 prêts──▶ maillots ──2 prêts──▶ match ──▶ fin
 *      ▲                   ▲                                         ▲          │
 *      └── invité parti    └──────────── 2 votes « équipes » ────────┴─ 2 votes « rejouer »
 *
 * Chaque joueur n'agit que sur ses propres choix (équipe, maillot, prêt,
 * vote) ; on ne passe à l'étape suivante que quand les deux ont validé.
 * Module pur (aucun réseau, aucun DOM) : l'hôte applique ici ses actions et
 * celles reçues du client, puis diffuse l'état obtenu.
 */

import { BONUS_EQUIPE, type BonusEquipe } from '@core/types';

export type VarianteMaillot = 'interieur' | 'exterieur';
export type PhaseLan = 'attente' | 'equipes' | 'maillots' | 'match' | 'fin';
export type VoteFin = 'rejouer' | 'equipes';
/** 0 = l'hôte (équipe de gauche), 1 = l'invité. */
export type Place = 0 | 1;

export interface JoueurLan {
  nom: string;
  /** Identifiant stable de l'appareil (historique des duels), jamais publié hors de la liaison chiffrée. */
  appareil: string;
  equipe: string;
  variante: VarianteMaillot;
  pret: boolean;
  vote: VoteFin | null;
}

export interface ConfigLan {
  effectif: number;
  duree: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  /** Ralenti des buts sur les deux écrans. */
  ralenti: boolean;
}

export interface EtatPartieLan {
  phase: PhaseLan;
  config: ConfigLan;
  joueurs: [JoueurLan, JoueurLan | null];
  /** Joueur qui a mis le match en pause (la pause vaut pour les deux écrans). */
  pause: Place | null;
  /** Secondes restantes du compte à rebours de reprise (0 = aucun). */
  reprise: number;
  /** Handicap de chaque camp, proposé par l'hôte (validé par l'invité en appuyant sur PRÊT). */
  bonus: [BonusEquipe, BonusEquipe];
  /** Qui a demandé à passer le ralenti du but en cours (il s'arrête quand les deux ont passé). */
  ralentiPasse: [boolean, boolean];
}

export type ActionLan =
  | { a: 'lancer' }
  | { a: 'equipe'; equipe: string }
  | { a: 'variante'; variante: VarianteMaillot }
  | { a: 'pret'; pret: boolean }
  | { a: 'vote'; vote: VoteFin | null }
  | { a: 'pause'; on: boolean }
  /** Réservé à l'hôte : handicap d'un des deux camps. */
  | { a: 'bonus'; place: Place; bonus: BonusEquipe }
  | { a: 'passer' };

export const REPRISE_S = 3;

export function nouvellePartie(config: ConfigLan, nom: string, equipe: string, appareil: string): EtatPartieLan {
  return {
    phase: 'attente',
    config: { ...config },
    joueurs: [{ nom, appareil, equipe, variante: 'interieur', pret: false, vote: null }, null],
    pause: null,
    reprise: 0,
    bonus: ['aucun', 'aucun'],
    ralentiPasse: [false, false],
  };
}

export function inviteArrive(e: EtatPartieLan, nom: string, equipe: string, appareil: string): void {
  e.joueurs[1] = { nom, appareil, equipe, variante: 'interieur', pret: false, vote: null };
  e.phase = 'attente';
  // un nouvel adversaire : pas de handicap hérité du précédent
  e.bonus = ['aucun', 'aucun'];
}

/** Un but vient d'être marqué : personne n'a encore passé son ralenti. */
export function debutRalenti(e: EtatPartieLan): void {
  e.ralentiPasse = [false, false];
}

export function invitePart(e: EtatPartieLan): void {
  e.joueurs[1] = null;
  e.phase = 'attente';
  e.pause = null;
  e.reprise = 0;
  e.joueurs[0].pret = false;
  e.joueurs[0].vote = null;
}

/** Même équipe et même maillot : on ne distinguerait plus les deux camps. */
export function maillotsIdentiques(e: EtatPartieLan): boolean {
  const [a, b] = e.joueurs;
  return !!b && a.equipe === b.equipe && a.variante === b.variante;
}

function versEquipes(e: EtatPartieLan): void {
  e.phase = 'equipes';
  for (const j of e.joueurs) if (j) Object.assign(j, { pret: false, vote: null });
}

export function versFin(e: EtatPartieLan): void {
  e.phase = 'fin';
  e.pause = null;
  e.reprise = 0;
  for (const j of e.joueurs) if (j) Object.assign(j, { pret: false, vote: null });
}

/**
 * Applique l'action d'un joueur. Renvoie `true` si elle déclenche le début
 * d'un match (les deux ont validé leurs maillots, ou voté « rejouer »).
 * Toute action hors de propos (mauvaise phase, choix verrouillé, pas son
 * tour...) est simplement ignorée.
 */
export function appliqueAction(e: EtatPartieLan, qui: Place, action: ActionLan, equipeConnue: (id: string) => boolean = () => true): boolean {
  const moi = e.joueurs[qui];
  const autre = e.joueurs[qui === 0 ? 1 : 0];
  if (!moi) return false;
  switch (action.a) {
    case 'lancer':
      if (qui === 0 && e.phase === 'attente' && autre) versEquipes(e);
      return false;
    case 'equipe':
      if (e.phase === 'equipes' && !moi.pret && equipeConnue(action.equipe)) moi.equipe = action.equipe;
      return false;
    case 'variante':
      if (e.phase === 'maillots' && !moi.pret) moi.variante = action.variante;
      return false;
    case 'pret': {
      if (e.phase !== 'equipes' && e.phase !== 'maillots') return false;
      if (action.pret && e.phase === 'maillots' && autre?.pret && maillotsIdentiques(e)) return false;
      moi.pret = action.pret;
      if (!autre?.pret || !moi.pret) return false;
      if (e.phase === 'equipes') {
        const [hote, invite] = e.joueurs as [JoueurLan, JoueurLan];
        e.phase = 'maillots';
        hote.variante = 'interieur';
        // même club des deux côtés : l'invité part en maillot extérieur
        invite.variante = hote.equipe === invite.equipe ? 'exterieur' : 'interieur';
        hote.pret = invite.pret = false;
        return false;
      }
      if (maillotsIdentiques(e)) {
        moi.pret = false;
        return false;
      }
      e.phase = 'match';
      e.pause = null;
      e.reprise = 0;
      return true;
    }
    case 'vote': {
      if (e.phase !== 'fin') return false;
      moi.vote = action.vote;
      if (!autre || !moi.vote || moi.vote !== autre.vote) return false;
      if (moi.vote === 'equipes') {
        versEquipes(e);
        return false;
      }
      e.phase = 'match';
      moi.vote = autre.vote = null;
      return true;
    }
    case 'bonus':
      if (qui === 0 && (e.phase === 'attente' || e.phase === 'equipes')) {
        e.bonus[action.place] = action.bonus;
        // l'invité doit revalider en connaissant le nouveau handicap
        for (const j of e.joueurs) if (j) j.pret = false;
      }
      return false;
    case 'passer':
      if (e.phase === 'match') e.ralentiPasse[qui] = true;
      return false;
    case 'pause':
      if (e.phase !== 'match') return false;
      if (action.on) {
        e.pause = qui;
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

function lisJoueur(o: unknown): JoueurLan | null {
  if (!o || typeof o !== 'object') return null;
  const j = o as Record<string, unknown>;
  if (typeof j.nom !== 'string' || !NOM_SUR.test(j.nom)) return null;
  if (typeof j.equipe !== 'string' || !EQUIPE_SURE.test(j.equipe)) return null;
  if (!estVariante(j.variante) || typeof j.pret !== 'boolean' || !estVote(j.vote)) return null;
  if (typeof j.appareil !== 'string' || !APPAREIL_SUR.test(j.appareil)) return null;
  return { nom: j.nom, appareil: j.appareil, equipe: j.equipe, variante: j.variante, pret: j.pret, vote: j.vote };
}

export function lisConfig(o: unknown): ConfigLan | null {
  if (!o || typeof o !== 'object') return null;
  const c = o as Record<string, unknown>;
  if (!entier(c.effectif, 9) || !entier(c.duree, 9)) return null;
  if (typeof c.assistTir !== 'boolean' || typeof c.assistPasse !== 'boolean' || typeof c.changementAuto !== 'boolean') return null;
  if (typeof c.ralenti !== 'boolean') return null;
  return {
    effectif: c.effectif,
    duree: c.duree,
    assistTir: c.assistTir,
    assistPasse: c.assistPasse,
    changementAuto: c.changementAuto,
    ralenti: c.ralenti,
  };
}

/** Valide l'état diffusé par l'hôte (côté client). */
export function lisEtatPartie(o: unknown): EtatPartieLan | null {
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (!PHASES.includes(e.phase as PhaseLan)) return null;
  const config = lisConfig(e.config);
  if (!config || !Array.isArray(e.joueurs) || e.joueurs.length !== 2) return null;
  const hote = lisJoueur(e.joueurs[0]);
  const invite = e.joueurs[1] === null ? null : lisJoueur(e.joueurs[1]);
  if (!hote || (e.joueurs[1] !== null && !invite)) return null;
  if (!(e.pause === null || e.pause === 0 || e.pause === 1)) return null;
  if (typeof e.reprise !== 'number' || !(e.reprise >= 0 && e.reprise <= REPRISE_S)) return null;
  const b = e.bonus;
  const rp = e.ralentiPasse;
  if (!Array.isArray(b) || b.length !== 2 || !b.every(estBonus)) return null;
  if (!Array.isArray(rp) || rp.length !== 2 || !rp.every((x) => typeof x === 'boolean')) return null;
  return {
    phase: e.phase as PhaseLan,
    config,
    joueurs: [hote, invite],
    pause: e.pause,
    reprise: e.reprise,
    bonus: [b[0] as BonusEquipe, b[1] as BonusEquipe],
    ralentiPasse: [rp[0] as boolean, rp[1] as boolean],
  };
}

/** Valide une action reçue du client (côté hôte). */
export function lisAction(o: unknown): ActionLan | null {
  if (!o || typeof o !== 'object') return null;
  const a = o as Record<string, unknown>;
  switch (a.a) {
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
      // « lancer » et « bonus » sont réservés à l'hôte : jamais acceptés du réseau
      return null;
  }
}
