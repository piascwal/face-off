/** Partie Wi-Fi : validation de tout ce qui arrive du réseau (état diffusé, actions, configuration). */

import { NIVEAUX } from '@core/constants';
import { BONUS_EQUIPE, type BonusEquipe } from '@core/types';
import {
  estFormat,
  REPRISE_S,
  SPECTATEURS_MAX,
  type ActionLan,
  type CampLan,
  type ConfigLan,
  type EtatPartieLan,
  type JoueurLan,
  type MembreLan,
  type PhaseLan,
  type Siege,
  type VarianteMaillot,
  type VoteFin,
} from './partie-modele';

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
