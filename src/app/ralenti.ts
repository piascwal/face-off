import { DUREE_BUT } from '@core/rules';
import type { GamePhase, MatchState, Rink } from '@core/types';
import { appliqueInstantane, type Instantane } from '@net/protocole';

/** Célébration en direct (bandeau, écusson) avant que le ralenti ne démarre. */
export const CELEBRATION_S = 1.6;
/** Portion rejouée : ce qui précède le but, et un peu après. */
const AVANT_S = 2.5;
const APRES_S = 0.3;
/** Vitesse de lecture du ralenti. */
const VITESSE = 0.5;
const HISTORIQUE_S = 4;

/** Durée de la phase « but » quand le ralenti est activé : célébration + ralenti + une courte marge. */
export const DUREE_BUT_RALENTI = CELEBRATION_S + (AVANT_S + APRES_S) / VITESSE + 0.4;

export function dureeBut(ralenti: boolean): number {
  return ralenti ? DUREE_BUT_RALENTI : DUREE_BUT;
}

/**
 * Ralenti des buts : garde les dernières secondes du match sous forme
 * d'instantanés (les mêmes que ceux qu'envoie l'hôte en Wi-Fi) et les
 * rejoue à demi-vitesse après la célébration. En Wi-Fi, chaque appareil
 * rejoue ses propres instantanés, calés sur le même temps de simulation :
 * le ralenti démarre ensemble sur les deux écrans, sans rien envoyer de plus.
 */
export class Ralenti {
  private historique: Instantane[] = [];
  private butA: number | null = null;
  private lecture: { images: Instantane[]; t: number } | null = null;
  private fini = false;
  private phasePrecedente: GamePhase | null = null;

  get actif(): boolean {
    return this.lecture !== null;
  }

  /** Avancement de la lecture, de 0 à 1. */
  get progression(): number {
    const l = this.lecture;
    if (!l) return 0;
    const a = l.images[0]!.temps;
    const b = l.images.at(-1)!.temps;
    return b > a ? Math.min(1, (l.t - a) / (b - a)) : 1;
  }

  enregistre(inst: Instantane): void {
    const dernier = this.historique.at(-1);
    // nouveau match (le temps repart de zéro) : l'historique précédent ne sert plus
    if (dernier && inst.temps < dernier.temps - 1) this.historique = [];
    if (dernier && inst.temps <= dernier.temps) return;
    this.historique.push(inst);
    while (this.historique.length && this.historique[0]!.temps < inst.temps - HISTORIQUE_S) this.historique.shift();
  }

  /**
   * À appeler à chaque image avec l'état affiché. `fige` = match en pause
   * (la lecture attend). Démarre le ralenti une fois la célébration passée,
   * l'arrête dès que le jeu repart (remise en jeu, ou ralenti passé).
   */
  maj(state: MatchState, dt: number, fige: boolean): void {
    if (state.phase === 'but' && this.phasePrecedente !== 'but') {
      this.butA = state.temps;
      this.fini = false;
    }
    this.phasePrecedente = state.phase;
    if (state.phase !== 'but' || state.dureeBut < DUREE_BUT_RALENTI) {
      this.arrete();
      this.butA = null;
      return;
    }
    const but = this.butA;
    if (but === null || this.fini) return;
    if (!this.lecture && state.temps >= but + CELEBRATION_S) {
      const images = this.historique.filter((i) => i.temps >= but - AVANT_S && i.temps <= but + APRES_S);
      if (images.length < 10) {
        this.fini = true;
        return;
      }
      this.lecture = { images, t: images[0]!.temps };
    }
    const l = this.lecture;
    if (!l || fige) return;
    l.t += dt * VITESSE;
    if (l.t >= l.images.at(-1)!.temps) this.arrete();
  }

  /** Coupe la lecture en cours (bouton PASSER, ou fin du ralenti). */
  arrete(): void {
    if (this.lecture) this.fini = true;
    this.lecture = null;
  }

  /** Écrit l'image courante du ralenti dans `state` (un état dédié à l'affichage). */
  applique(state: MatchState, rink: Rink): void {
    const l = this.lecture;
    if (!l) return;
    let i = 0;
    while (i < l.images.length - 2 && l.images[i + 1]!.temps <= l.t) i++;
    const a = l.images[i]!;
    const b = l.images[i + 1] ?? a;
    const alpha = b.temps > a.temps ? Math.min(1, Math.max(0, (l.t - a.temps) / (b.temps - a.temps))) : 1;
    appliqueInstantane(state, a, b, alpha, rink);
  }

  reinitialise(): void {
    this.historique = [];
    this.lecture = null;
    this.butA = null;
    this.fini = false;
    this.phasePrecedente = null;
  }
}
