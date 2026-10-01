import { coupeTerminee, NOMS_TOURS } from '@core/coupe';
import { DUREES, EFFECTIFS, NIVEAUX, niveauInterpole } from '@core/constants';
import { creePartie, type OptionsPartie } from '@core/rules';
import { trouveEquipe } from '@core/teams';
import type { MatchState } from '@core/types';
import {
  C,
  dessineAideCommandes,
  dessineAvance,
  dessineChoixMaillots,
  dessineFin,
  dessineMenu,
  dessinePause,
  dessineSelectionEquipe,
  EQUIPES_JOUABLES,
  resoutEquipe,
  type CarteEquipe,
  type CoteMaillot,
  type EquipeVisuelle,
  type EtatAideCommandes,
  type EtatAvance,
  type EtatChoixMaillots,
  type EtatFin,
  type EtatMenu,
  type EtatSelectionEquipe,
  type OngletCommandes,
  type Variante,
} from '@render/index';
import type { EcranUI } from './ecrans';
import type { GameApp } from './game-app';
import { sauvePreferences } from './preferences';
import { dureeBut } from './ralenti';
import { demandePleinEcranPaysage } from './pwa';

/** Carte d'une équipe jouable (écusson, notes), par son rang dans la liste. */
export function carteEquipe(index: number): CarteEquipe {
  const def = EQUIPES_JOUABLES[index]!;
  return { def, profil: trouveEquipe(def.id) };
}

/**
 * Parcours solo contre l'ordinateur : menu, réglages avancés, choix des
 * équipes puis des maillots, match, pause et écran de fin. Le match lui-même
 * (`lanceMatch`) sert aussi à la coupe.
 */
export class ParcoursSolo {
  indexJoueur = 0;
  indexAdversaire = 0;
  varianteJoueur: Variante = 'interieur';
  varianteAdversaire: Variante = 'interieur';
  /** Niveau de difficulté du match en cours (en coupe, fractionnaire : il monte un peu à chaque tour). */
  niveauMatch = 1;
  /** Onglet de l'écran des commandes (au départ : celui de l'appareil). */
  ongletCommandes: OngletCommandes | null = null;

  constructor(private readonly app: GameApp) {}

  /** JOUER : un match simple, ou la coupe selon le mode choisi à l'accueil. */
  jouer(): void {
    if (this.app.pref.mode === 'coupe') this.app.coupe.ouvre();
    else this.ouvreSelectionEquipe();
  }

  ouvreSelectionEquipe(): void {
    const app = this.app;
    app.audio.init();
    this.indexJoueur = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === app.pref.equipeJoueur));
    this.indexAdversaire = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === app.equipesActuelles[1].teamId));
    app.ecranUI = 'equipes';
  }

  private ouvreAvance(): void {
    this.app.audio.clic();
    this.app.ecranUI = 'avance';
  }

  private fermeAvance(): void {
    this.app.audio.clic();
    this.app.ecranUI = 'menu';
  }

  private ouvreCommandes(): void {
    this.app.audio.clic();
    this.ongletCommandes ??= this.app.entrees.tactile ? 'tactile' : 'clavier';
    this.app.ecranUI = 'commandes';
  }

  private fermeCommandes(): void {
    this.app.audio.clic();
    this.app.ecranUI = 'avance';
  }

  private changeOngletCommandes(o: OngletCommandes): void {
    this.app.audio.clic();
    this.ongletCommandes = o;
  }

  private tourneJoueur(sens: 1 | -1): void {
    this.app.audio.clic();
    const n = EQUIPES_JOUABLES.length;
    this.indexJoueur = (this.indexJoueur + sens + n) % n;
  }

  private tourneAdversaire(sens: 1 | -1): void {
    this.app.audio.clic();
    const n = EQUIPES_JOUABLES.length;
    this.indexAdversaire = (this.indexAdversaire + sens + n) % n;
  }

  /** Étape 1 validée : les équipes sont fixées, on passe au choix des maillots. */
  confirmeSelection(): void {
    const app = this.app;
    app.audio.clic();
    app.pref.equipeJoueur = EQUIPES_JOUABLES[this.indexJoueur]!.id;
    sauvePreferences(app.pref);
    this.varianteJoueur = 'interieur';
    this.varianteAdversaire = 'interieur';
    app.ecranUI = 'maillots';
  }

  private toggleVarianteJoueur(): void {
    this.app.audio.clic();
    this.varianteJoueur = this.varianteJoueur === 'interieur' ? 'exterieur' : 'interieur';
  }

  private toggleVarianteAdversaire(): void {
    this.app.audio.clic();
    this.varianteAdversaire = this.varianteAdversaire === 'interieur' ? 'exterieur' : 'interieur';
  }

  private retourChoixEquipes(): void {
    this.app.audio.clic();
    this.app.ecranUI = 'equipes';
  }

  /** Étape 2 validée : les maillots sont fixés, on lance le match. */
  confirmeMaillots(): void {
    const defJoueur = EQUIPES_JOUABLES[this.indexJoueur]!;
    const defAdverse = EQUIPES_JOUABLES[this.indexAdversaire]!;
    this.lanceMatch(resoutEquipe(defJoueur, this.varianteJoueur), resoutEquipe(defAdverse, this.varianteAdversaire));
  }

  /** Match contre l'ordinateur (niveau du menu, ou celui du tour en coupe). */
  lanceMatch(equipeJoueur: EquipeVisuelle, equipeAdverse: EquipeVisuelle, niveau = this.app.pref.niveau, sousTitre?: string): void {
    const app = this.app;
    const pref = app.pref;
    app.audio.init();
    app.coupe.matchCoupe = false;
    this.niveauMatch = niveau;
    void demandePleinEcranPaysage();
    app.equipesActuelles = [equipeJoueur, equipeAdverse];
    app.effets.definitEquipes(app.equipesActuelles);
    app.construitDecor();
    const options: OptionsPartie = {
      mode: 'match',
      niveauIdx: niveau,
      dureeIdx: pref.duree,
      effectifIdx: pref.effectif,
      equipeJoueur: trouveEquipe(equipeJoueur.teamId),
      equipeAdverse: trouveEquipe(equipeAdverse.teamId),
      assistTir: pref.assistTir,
      assistPasse: pref.assistPasse,
      changementAuto: pref.changementAuto,
      dureeBut: dureeBut(pref.ralentiButs),
      pouvoirs: pref.bonus,
    };
    app.demarreRalenti(options);
    app.state = creePartie(app.rink!, options);
    app.effets.reinitialise();
    app.ecranUI = 'jeu';
    app.enPause = false;
    app.effets.annonce('PRETS ?', sousTitre ?? niveauInterpole(niveau).nom, C.blanc, 1.5);
  }

  /** Rejoue immédiatement avec les deux mêmes équipes et maillots (pas de repassage par la sélection). */
  rejoue(): void {
    this.lanceMatch(this.app.equipesActuelles[0], this.app.equipesActuelles[1]);
  }

  /** Bilan des matchs solo, rangé sous le niveau de base (FACILE+ compte comme FACILE). */
  persisteFinMatch(gagne: boolean): void {
    const pref = this.app.pref;
    const n = Math.floor(this.niveauMatch);
    pref.matchs[n] = (pref.matchs[n] ?? 0) + 1;
    if (gagne) pref.victoires[n] = (pref.victoires[n] ?? 0) + 1;
    sauvePreferences(pref);
  }

  // ---------------------------------------------------------------- clavier

  /** Touches des écrans solo (`ecran` : l'écran au moment de l'appui). */
  touche(e: KeyboardEvent, ecran: EcranUI): void {
    const repete = e.repeat;
    if (e.code === 'Enter') {
      if (ecran === 'menu') this.jouer();
      else if (ecran === 'equipes') this.confirmeSelection();
      else if (ecran === 'maillots') this.confirmeMaillots();
      else if (ecran === 'avance') this.fermeAvance();
      else if (ecran === 'commandes') this.fermeCommandes();
    }
    if (e.code === 'Escape' && ecran === 'maillots') this.retourChoixEquipes();
    if (e.code === 'Escape' && ecran === 'avance') this.fermeAvance();
    if (e.code === 'Escape' && ecran === 'commandes') this.fermeCommandes();
    if (ecran === 'commandes' && !repete && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      this.changeOngletCommandes(this.ongletCommandes === 'tactile' ? 'clavier' : 'tactile');
    }
    if (e.code === 'Escape' && ecran === 'equipes') this.app.retourMenu();
    if (ecran === 'equipes' && !repete) {
      // pensé « manette » : gauche/droite pour votre équipe, haut/bas pour l'adversaire
      if (e.code === 'ArrowLeft') this.tourneJoueur(-1);
      else if (e.code === 'ArrowRight') this.tourneJoueur(1);
      else if (e.code === 'ArrowUp') this.tourneAdversaire(-1);
      else if (e.code === 'ArrowDown') this.tourneAdversaire(1);
    }
    if (ecran === 'maillots' && !repete) {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') this.toggleVarianteJoueur();
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') this.toggleVarianteAdversaire();
    }
  }

  // ------------------------------------------------------------------ rendu

  /** Dessine l'écran solo en cours ; renvoie false si ce n'en est pas un. */
  dessine(g: CanvasRenderingContext2D, temps: number, state: MatchState): boolean {
    const app = this.app;
    const { W, H, boutons } = app;
    switch (app.ecranUI) {
      case 'menu':
        dessineMenu(g, boutons, W, H, temps, this.menuProps());
        return true;
      case 'avance':
        dessineAvance(g, boutons, W, H, this.avanceProps());
        return true;
      case 'commandes':
        dessineAideCommandes(g, boutons, W, H, temps, this.commandesProps());
        return true;
      case 'equipes':
        dessineSelectionEquipe(g, boutons, W, H, this.selectionProps());
        return true;
      case 'maillots':
        dessineChoixMaillots(g, boutons, app.sprites, W, H, this.maillotsProps());
        return true;
      case 'pause':
        // en coupe, abandonner un match ramène au tableau (le match n'est pas compté)
        dessinePause(g, boutons, W, H, () => app.pause(false), () => (app.coupe.matchCoupe ? app.coupe.ouvreTableau() : app.retourMenu()));
        return true;
      case 'fin':
        dessineFin(g, boutons, W, H, temps, this.finProps(state));
        return true;
      default:
        return false;
    }
  }

  private menuProps(): EtatMenu {
    const app = this.app;
    const pref = app.pref;
    const c = pref.coupe;
    const bascule = <K extends 'niveau' | 'duree' | 'effectif'>(cle: K, n: number) => () => {
      pref[cle] = (pref[cle] + 1) % n;
      sauvePreferences(pref);
    };
    return {
      coupe: pref.mode === 'coupe',
      tourCoupe: c && !coupeTerminee(c) ? NOMS_TOURS[c.tour]! : null,
      onMode: () => {
        pref.mode = pref.mode === 'coupe' ? 'classique' : 'coupe';
        sauvePreferences(pref);
      },
      niveauIdx: pref.niveau,
      dureeIdx: pref.duree,
      effectifIdx: pref.effectif,
      bonus: pref.bonus,
      version: __VERSION_APP__,
      onNiveau: bascule('niveau', NIVEAUX.length),
      onDuree: bascule('duree', DUREES.length),
      onEffectif: bascule('effectif', EFFECTIFS.length),
      onBonus: () => {
        pref.bonus = !pref.bonus;
        sauvePreferences(pref);
      },
      onJouer: () => this.jouer(),
      onReseau: () => app.lan.ouvre(),
      onAvance: () => this.ouvreAvance(),
    };
  }

  private avanceProps(): EtatAvance {
    const app = this.app;
    const pref = app.pref;
    const bascule = (cle: 'assistTir' | 'assistPasse' | 'changementAuto' | 'ralentiButs') => () => {
      pref[cle] = !pref[cle];
      sauvePreferences(pref);
    };
    return {
      son: pref.son,
      assistTir: pref.assistTir,
      assistPasse: pref.assistPasse,
      changementAuto: pref.changementAuto,
      secoussesReduites: pref.secoussesReduites,
      ralentiButs: pref.ralentiButs,
      onRalenti: bascule('ralentiButs'),
      onAssistTir: bascule('assistTir'),
      onAssistPasse: bascule('assistPasse'),
      onChangementAuto: bascule('changementAuto'),
      onSecousses: () => {
        pref.secoussesReduites = !pref.secoussesReduites;
        app.effets.intensiteEcran = pref.secoussesReduites ? 0.4 : 1;
        sauvePreferences(pref);
      },
      onSon: () => {
        pref.son = !pref.son;
        app.audio.muet(!pref.son);
        sauvePreferences(pref);
      },
      onCommandes: () => this.ouvreCommandes(),
      onRetour: () => this.fermeAvance(),
    };
  }

  private commandesProps(): EtatAideCommandes {
    return {
      onglet: this.ongletCommandes ?? 'clavier',
      onOnglet: (o) => this.changeOngletCommandes(o),
      onRetour: () => this.fermeCommandes(),
    };
  }

  private selectionProps(): EtatSelectionEquipe {
    return {
      joueur: carteEquipe(this.indexJoueur),
      adversaire: carteEquipe(this.indexAdversaire),
      onPrecedentJoueur: () => this.tourneJoueur(-1),
      onSuivantJoueur: () => this.tourneJoueur(1),
      onPrecedentAdversaire: () => this.tourneAdversaire(-1),
      onSuivantAdversaire: () => this.tourneAdversaire(1),
      onConfirmer: () => this.confirmeSelection(),
      onRetour: () => this.app.retourMenu(),
    };
  }

  private maillotsProps(): EtatChoixMaillots {
    const cote = (index: number, variante: Variante): CoteMaillot => ({ def: EQUIPES_JOUABLES[index]!, variante });
    return {
      joueur: cote(this.indexJoueur, this.varianteJoueur),
      adversaire: cote(this.indexAdversaire, this.varianteAdversaire),
      onToggleJoueur: () => this.toggleVarianteJoueur(),
      onToggleAdversaire: () => this.toggleVarianteAdversaire(),
      onRetour: () => this.retourChoixEquipes(),
      onConfirmer: () => this.confirmeMaillots(),
    };
  }

  private finProps(state: MatchState): EtatFin {
    const app = this.app;
    const enCoupe = app.coupe.matchCoupe;
    const niveau = niveauInterpole(this.niveauMatch).nom;
    return {
      score: state.score,
      tirs: state.tirs,
      stats: state.stats,
      prolong: state.prolong,
      niveauNom: niveau,
      victoires: app.pref.victoires[Math.floor(this.niveauMatch)] ?? 0,
      matchs: app.pref.matchs[Math.floor(this.niveauMatch)] ?? 0,
      equipes: app.equipesActuelles,
      onRejouer: () => (enCoupe ? app.coupe.ouvreTableau() : this.rejoue()),
      onMenu: () => app.retourMenu(),
      libelleRejouer: enCoupe ? 'TABLEAU >' : undefined,
      pied: enCoupe ? `COUPE FACE-OFF  -  NIVEAU ${niveau}` : undefined,
    };
  }
}
