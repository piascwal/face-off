import { coupeTerminee, creeCoupe, enregistreResultat, matchDuJoueur, niveauDuTour, nomsTours, type TailleCoupe } from '@core/coupe';
import { niveauInterpole } from '@core/constants';
import type { MatchState } from '@core/types';
import {
  dessineChoixCoupe,
  dessineTableauCoupe,
  EQUIPES_JOUABLES,
  etapesRevelation,
  etapesVues,
  palette,
  resoutEquipe,
  trouveTeamDef,
  varianteAdverse,
  type EtatChoixCoupe,
  type EtatTableauCoupe,
  type Revelation,
  type Variante,
} from '@render/index';
import type { EcranUI } from './ecrans';
import type { GameApp } from './game-app';
import { carteEquipe } from './parcours-solo';
import { sauvePreferences, tailleDuMode } from './preferences';

/**
 * Mode coupe : choix de l'équipe, tableau à 8 ou 16 équipes (voir core/coupe.ts),
 * matchs du joueur tour après tour, et dévoilement des résultats du tour sur
 * le tableau après chaque match. La coupe en cours est sauvegardée dans les
 * préférences (`pref.coupe`).
 */
export class ParcoursCoupe {
  /** Le match en cours est un match de la coupe (son résultat va au tableau). */
  matchCoupe = false;
  /** Résultats de la coupe à dévoiler sur le tableau. */
  revelation: Revelation | null = null;
  private etapesSonnees = 0;
  /** Abandon de la coupe à confirmer (jusqu'à cet instant, en s). */
  private confirmeAbandonJusqua = 0;
  /** Choix de l'équipe (écran `coupeChoix`). */
  private indexEquipe = 0;
  private variante: Variante = 'interieur';
  /** Taille de la coupe en cours de choix (celle du mode choisi à l'accueil). */
  private taille: TailleCoupe = 8;

  constructor(private readonly app: GameApp) {}

  /** JOUER en mode coupe : reprend la coupe en cours, sinon choix de l'équipe. */
  ouvre(): void {
    this.app.audio.init();
    if (this.app.pref.coupe) this.ouvreTableau();
    else this.ouvreChoix();
  }

  private ouvreChoix(): void {
    this.indexEquipe = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === this.app.pref.equipeJoueur));
    this.variante = 'interieur';
    this.taille = tailleDuMode(this.app.pref.mode) ?? 8;
    this.app.ecranUI = 'coupeChoix';
  }

  private tourneEquipe(sens: 1 | -1): void {
    this.app.audio.clic();
    const n = EQUIPES_JOUABLES.length;
    this.indexEquipe = (this.indexEquipe + sens + n) % n;
  }

  private toggleVariante(): void {
    this.app.audio.clic();
    this.variante = this.variante === 'interieur' ? 'exterieur' : 'interieur';
  }

  lance(): void {
    const app = this.app;
    app.audio.clic();
    const def = EQUIPES_JOUABLES[this.indexEquipe]!;
    app.pref.equipeJoueur = def.id;
    app.pref.coupe = creeCoupe(def.id, this.variante, app.pref.niveau, this.taille);
    sauvePreferences(app.pref);
    this.revelation = null;
    this.ouvreTableau();
  }

  ouvreTableau(): void {
    const app = this.app;
    if (app.state?.mode === 'match') app.creeDemo();
    this.matchCoupe = false;
    app.enPause = false;
    app.effets.reinitialise();
    app.imageFin.efface();
    app.ecranUI = 'coupe';
    if (this.revelation && this.revelation.t0 === null) {
      this.revelation.t0 = performance.now() / 1000;
      this.etapesSonnees = 0;
    }
  }

  /** Match du tour contre l'adversaire du tableau, au niveau du tour. */
  joueMatch(): void {
    const c = this.app.pref.coupe;
    const mj = c && matchDuJoueur(c);
    if (!c || !mj) return;
    const defJ = trouveTeamDef(c.equipe);
    const defA = trouveTeamDef(mj.adversaire);
    const eqJ = resoutEquipe(defJ, c.variante);
    const eqA = resoutEquipe(defA, varianteAdverse(palette(defJ, c.variante), defA));
    const niveau = niveauDuTour(c);
    this.revelation = null;
    this.app.solo.lanceMatch(eqJ, eqA, niveau, `${nomsTours(c.taille)[c.tour]} - ${niveauInterpole(niveau).nom}`);
    this.matchCoupe = true;
  }

  /** Match de coupe terminé : le résultat entre au tableau, les autres matchs du tour se jouent. */
  noteMatch(state: MatchState): void {
    const c = this.app.pref.coupe;
    if (!this.matchCoupe || !c) return;
    const tours = enregistreResultat(c, state.score[0], state.score[1], state.prolong);
    sauvePreferences(this.app.pref);
    this.revelation = { etapes: etapesRevelation(c, tours), t0: null };
  }

  private abandonne(): void {
    const t = performance.now() / 1000;
    if (t > this.confirmeAbandonJusqua) {
      this.confirmeAbandonJusqua = t + 3;
      return;
    }
    this.app.pref.coupe = null;
    sauvePreferences(this.app.pref);
    this.app.retourMenu();
  }

  /** Quitte le tableau : une coupe terminée est rangée (la prochaine partie en ouvre une nouvelle). */
  quitteTableau(): void {
    const pref = this.app.pref;
    if (pref.coupe && coupeTerminee(pref.coupe)) {
      pref.coupe = null;
      sauvePreferences(pref);
    }
    this.app.retourMenu();
  }

  nouvelle(): void {
    this.app.pref.coupe = null;
    sauvePreferences(this.app.pref);
    this.ouvreChoix();
  }

  passeRevelation(): void {
    const r = this.revelation;
    if (r?.t0 != null) r.t0 = -1e6;
  }

  /** Entrée sur le tableau : passe le dévoilement, sinon joue le match du tour (ou relance une coupe). */
  private entreeTableau(): void {
    const r = this.revelation;
    const c = this.app.pref.coupe;
    if (r && r.t0 !== null && etapesVues(r, performance.now() / 1000) < r.etapes.length) this.passeRevelation();
    else if (c && coupeTerminee(c)) this.nouvelle();
    else this.joueMatch();
  }

  // ---------------------------------------------------------------- clavier

  touche(e: KeyboardEvent, ecran: EcranUI): void {
    if (e.code === 'Enter') {
      if (ecran === 'coupeChoix') this.lance();
      else if (ecran === 'coupe') this.entreeTableau();
    }
    if (e.code === 'Escape' && ecran === 'coupeChoix') this.app.retourMenu();
    if (e.code === 'Escape' && ecran === 'coupe') this.quitteTableau();
    if (ecran === 'coupeChoix' && !e.repeat) {
      if (e.code === 'ArrowLeft') this.tourneEquipe(-1);
      else if (e.code === 'ArrowRight') this.tourneEquipe(1);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') this.toggleVariante();
    }
  }

  // ------------------------------------------------------------------ rendu

  /** Dessine l'écran de coupe en cours ; renvoie false si ce n'en est pas un. */
  dessine(g: CanvasRenderingContext2D, temps: number): boolean {
    const app = this.app;
    if (app.ecranUI === 'coupeChoix') {
      dessineChoixCoupe(g, app.boutons, app.sprites, app.W, app.H, this.choixProps());
      return true;
    }
    if (app.ecranUI !== 'coupe' || !app.pref.coupe) return false;
    dessineTableauCoupe(g, app.boutons, app.W, app.H, temps, this.tableauProps());
    // un petit bruit à chaque résultat dévoilé
    const r = this.revelation;
    const n = r ? etapesVues(r, temps) : 0;
    if (n > this.etapesSonnees) {
      if (n - this.etapesSonnees === 1) app.audio.clic();
      this.etapesSonnees = n;
    }
    return true;
  }

  private choixProps(): EtatChoixCoupe {
    const def = EQUIPES_JOUABLES[this.indexEquipe]!;
    return {
      taille: this.taille,
      carte: carteEquipe(this.indexEquipe),
      maillot: { def, variante: this.variante },
      onPrecedent: () => this.tourneEquipe(-1),
      onSuivant: () => this.tourneEquipe(1),
      onMaillot: () => this.toggleVariante(),
      onRetour: () => this.app.retourMenu(),
      onLancer: () => this.lance(),
    };
  }

  private tableauProps(): EtatTableauCoupe {
    return {
      coupe: this.app.pref.coupe!,
      revelation: this.revelation,
      confirmeAbandon: performance.now() / 1000 < this.confirmeAbandonJusqua,
      onJouer: () => this.joueMatch(),
      onAbandonner: () => this.abandonne(),
      onNouvelle: () => this.nouvelle(),
      onMenu: () => this.quitteTableau(),
      onPasser: () => this.passeRevelation(),
    };
  }
}
