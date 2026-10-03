/** Partie Wi-Fi : rôles, sièges et composition des équipes humaines (fonctions pures sur l'état). */

import { type MatchState, type Skater } from '@core/types';
import {
  campDe,
  rangDe,
  siegeDeCamp,
  SIEGES,
  siegeExiste,
  type Camp,
  type ConfigLan,
  type EtatPartieLan,
  type JoueurLan,
  type Siege,
} from './partie-modele';

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

/**
 * Le patineur piloté sur cet appareil, celui dont l'affichage dépend
 * (commandes tactiles, jauge de tir, trait de visée, flèche bleue). Hors
 * match Wi-Fi (`e` null : solo, coupe), le joueur pilote l'équipe 0 ; en
 * Wi-Fi, celui de son siège, et un spectateur (`siege` null) personne.
 */
export function patineurPilote(state: MatchState, e: EtatPartieLan | null, siege: Siege | null): Skater | null {
  if (!e) return state.controles[0];
  if (siege === null) return null;
  return rangCore(e, siege) === 1 ? state.partenaires[campDe(siege)] : state.controles[campDe(siege)];
}
