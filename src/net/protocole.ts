import type { GameEvent } from '@core/types';
import {
  APPAREIL_SUR,
  estReaction,
  lisAction,
  lisEtatPartie,
  type ActionLan,
  type EtatPartieLan,
  type Reaction,
} from './partie';
import { idAleatoire, VERSION_PROTOCOLE } from './reseau-local';

/**
 * Protocole de jeu en réseau local — hôte autoritaire :
 * - l'hôte fait tourner la simulation (game-core, pas fixe 120 Hz) avec
 *   l'entrée du client pour l'équipe 1 ;
 * - il envoie ~60 instantanés binaires par seconde (canal `jeu`) et les
 *   évènements de jeu (sons, particules, annonces) sur le canal fiable ;
 * - le client affiche avec un léger retard adaptatif et interpole entre
 *   deux instantanés : mouvement fluide même si le Wi-Fi hoquette.
 * Tout ce qui arrive du réseau est validé (tailles, bornes, valeurs finies)
 * avant de toucher à l'état : un pair ne peut ni faire planter l'autre, ni
 * piloter autre chose que son propre joueur.
 */

export type { VarianteMaillot } from './partie';

export type MsgCtrl =
  /**
   * `spect` : l'appareil se présente comme spectateur (il ne joue pas).
   * `jeton` : secret tiré par l'invité à son arrivée ; le même jeton lui
   * rend sa place s'il revient après une coupure.
   */
  | { t: 'bonjour'; v: number; nom: string; equipe: string; appareil: string; spect: boolean; jeton: string }
  /** État de la partie (salle d'attente, choix, votes, pause), diffusé par l'hôte à chaque changement. */
  | { t: 'etat'; e: EtatPartieLan }
  /** Action du client sur ses propres choix (équipe, maillot, prêt, vote, pause). */
  | { t: 'action'; x: ActionLan }
  /** Un match commence avec l'état diffusé juste avant ; `s0` = numéro de son premier instantané. */
  | { t: 'debut'; s0: number }
  /** Évènements d'un pas, datés en temps de simulation (`k`) pour être joués en phase avec l'image. */
  | { t: 'ev'; k: number; l: unknown[] }
  | { t: 'ping'; k: number }
  | { t: 'pong'; k: number }
  /**
   * Réaction (logo d'une équipe, flamme, gyrophare...) : envoyée à l'hôte, qui
   * la relaie à tout le monde avec le nom de son auteur (`de`, vide à l'envoi).
   */
  | { t: 'reaction'; r: Reaction; de: string }
  | { t: 'quitte' }
  | { t: 'exclu' };

const NOM_SUR = /^[A-Z0-9 ]{1,14}$/;
const EQUIPE_SURE = /^[a-z]{2,16}$/;
const JETON_SUR = /^[0-9a-f]{32}$/;

/** Valide un message du canal de contrôle ; renvoie null s'il est mal formé. */
export function lisCtrl(o: unknown): MsgCtrl | null {
  if (!o || typeof o !== 'object') return null;
  const m = o as Record<string, unknown>;
  switch (m.t) {
    case 'bonjour':
      return typeof m.v === 'number' &&
        typeof m.nom === 'string' &&
        NOM_SUR.test(m.nom) &&
        typeof m.equipe === 'string' &&
        EQUIPE_SURE.test(m.equipe) &&
        typeof m.appareil === 'string' &&
        APPAREIL_SUR.test(m.appareil) &&
        typeof m.spect === 'boolean' &&
        typeof m.jeton === 'string' &&
        JETON_SUR.test(m.jeton)
        ? { t: 'bonjour', v: m.v, nom: m.nom, equipe: m.equipe, appareil: m.appareil, spect: m.spect, jeton: m.jeton }
        : null;
    case 'etat': {
      const e = lisEtatPartie(m.e);
      return e ? { t: 'etat', e } : null;
    }
    case 'action': {
      const x = lisAction(m.x);
      return x ? { t: 'action', x } : null;
    }
    case 'debut':
      return typeof m.s0 === 'number' && Number.isInteger(m.s0) && m.s0 >= 0 ? { t: 'debut', s0: m.s0 } : null;
    case 'ev':
      return Array.isArray(m.l) && m.l.length <= 200 && typeof m.k === 'number' && Number.isFinite(m.k) ? { t: 'ev', k: m.k, l: m.l } : null;
    case 'ping':
    case 'pong':
      return typeof m.k === 'number' && Number.isFinite(m.k) ? { t: m.t, k: m.k } : null;
    case 'reaction':
      return estReaction(m.r) && typeof m.de === 'string' && (m.de === '' || NOM_SUR.test(m.de)) ? { t: 'reaction', r: m.r, de: m.de } : null;
    case 'quitte':
    case 'exclu':
      return { t: m.t };
    default:
      return null;
  }
}

export function bonjour(nom: string, equipe: string, appareil: string, spect = false, jeton = idAleatoire(16)): MsgCtrl {
  return { t: 'bonjour', v: VERSION_PROTOCOLE, nom, equipe, appareil, spect, jeton };
}

// ------------------------------------------------------------ évènements --

const TYPES_EVENEMENTS = new Set<GameEvent['type']>([
  'frappe',
  'touche',
  'bande',
  'poteau',
  'jambiere',
  'charge',
  'elan',
  'raclement',
  'clic',
  'sifflet',
  'klaxon',
  'ovation',
  'but',
  'arret',
  'vole',
  'check',
  'etincelles',
  'neige',
  'confettis',
  'secousse',
  'flash',
  'vibre',
  'bulle',
  'annonce',
  'pouvoir',
  'onde',
  'verre',
]);

/** Prépare les évènements d'un pas pour l'envoi (les références d'objets ne voyagent pas). */
export function evenementsPourEnvoi(evs: GameEvent[]): unknown[] {
  return evs.map((e) => (e.type === 'but' ? { type: 'but', eq: e.eq, buteur: null } : e));
}

/**
 * Reconstruit un évènement reçu : type connu, uniquement des valeurs
 * primitives bornées, puis coordonnées ramenées dans la patinoire locale.
 */
export function lisEvenement(o: unknown, versLocal: (x: number, y: number) => [number, number], echelle: [number, number]): GameEvent | null {
  if (!o || typeof o !== 'object') return null;
  const src = o as Record<string, unknown>;
  if (typeof src.type !== 'string' || !TYPES_EVENEMENTS.has(src.type as GameEvent['type'])) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.length > 12) return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Math.abs(v) > 1e5) return null;
      out[k] = v;
    } else if (typeof v === 'string') {
      if (v.length > 40) return null;
      out[k] = v;
    } else if (typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      if (v.length > 8 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 5000)) return null;
      out[k] = [...v];
    } else return null;
  }
  if (typeof out.x === 'number' && typeof out.y === 'number') {
    const [x, y] = versLocal(out.x, out.y);
    out.x = x;
    out.y = y;
  }
  if (typeof out.vx === 'number') out.vx *= echelle[0];
  if (typeof out.vy === 'number') out.vy *= echelle[1];
  return out as unknown as GameEvent;
}
