import { menaceEchec } from '@core/actions';
import { pouvoirPret } from '@core/pouvoirs';
import { calculeRink, reprojette } from '@core/rink';
import { creePartie, DUREE_BUT, type OptionsPartie } from '@core/rules';
import { pas } from '@core/simulation';
import { INTENT_VIDE, type InputIntent, type MatchState, type Rink, type TeamId } from '@core/types';
import { decodeInstantane, encodeInstantane } from '@net/protocole';
import { joueEvenements, MoteurAudio } from '@audio/sound';
import { GestionnaireEntreesJeu, type PointLogique } from '@input/game-input';
import {
  BanqueSprites,
  C,
  clicSurBouton,
  construitFoule,
  construitGlace,
  dessineBanniere,
  dessineBoutonBonus,
  dessineCelebration,
  dessineCommandes,
  dessineJaugesBonus,
  dessineJaugeTir,
  dessineLogoBut,
  dessinePortrait,
  dessineRalenti,
  dessineScene,
  dessineTableau,
  EQUIPES_JOUABLES,
  resoutEquipe,
  SystemeEffets,
  texte,
  TracesGlace,
  trouveTeamDef,
  type DecorPatinoire,
  type EquipeVisuelle,
  type TeamDef,
  type ZoneBouton,
} from '@render/index';
import { ECRANS_MENU, type EcranUI } from './ecrans';
import { ImageFinMatch } from './image-fin';
import { ParcoursCoupe } from './parcours-coupe';
import { ParcoursLan } from './parcours-lan';
import { ParcoursSolo } from './parcours-solo';
import { chargePreferences, type Preferences } from './preferences';
import { Ralenti } from './ralenti';
import { estAutonome, PleinEcranAuPremierGeste } from './pwa';

const PAS_FIXE = 1 / 120;

/** Adversaire suggéré par défaut au démarrage / en démo, avant tout choix réel. */
function equipeAdverseParDefaut(idJoueur: string): TeamDef {
  return trouveTeamDef(idJoueur === 'montpellier' ? 'toulouse' : 'montpellier');
}

/**
 * Noyau de l'application : canevas et mise à l'échelle, patinoire, boucle de
 * jeu (simulation à pas fixe), rendu du match, entrées, ralenti des buts et
 * fin de match. Les écrans et leurs enchaînements sont dans les parcours :
 * - `solo` (parcours-solo.ts) : menu, réglages, choix des équipes, match contre l'ordinateur ;
 * - `coupe` (parcours-coupe.ts) : le mode coupe et son tableau ;
 * - `lan` (parcours-lan.ts) : le multijoueur Wi-Fi.
 * Les champs publics ci-dessous sont l'état partagé avec ces parcours.
 */
export class GameApp {
  private readonly ecran: HTMLCanvasElement;
  /**
   * On dessine directement à la résolution de l'écran, avec une échelle de
   * base ECHELLE : décor, texte et HUD gardent leurs gros pixels logiques,
   * tandis que les sprites des joueurs (pixels de 36/56 px logique) gardent
   * tout leur détail.
   */
  private readonly g: CanvasRenderingContext2D;
  private ECHELLE = 1;
  private portrait = false;
  private decor: DecorPatinoire | null = null;
  private dernier = 0;
  /** Options du match en cours, pour recréer un état d'affichage dédié au ralenti. */
  private optionsMatch: OptionsPartie | null = null;
  private etatRalenti: MatchState | null = null;
  private readonly pleinEcran = new PleinEcranAuPremierGeste();
  /**
   * Tant que c'est vrai (et qu'on est sur le menu), le tout premier geste de
   * l'utilisateur ne fait que déclencher le plein écran : il n'atteint aucun
   * bouton. Sans ça, ce premier geste tombait souvent sur JOUER, et la
   * bannière du navigateur (« glissez pour quitter le plein écran ») restait
   * affichée au-dessus du tout début du match. Ici, elle apparaît et
   * disparaît avant même que le joueur ait choisi son équipe.
   */
  private attenteDemarrage = !estAutonome();

  // ------------------------------------------ état partagé avec les parcours
  /** Taille logique de l'écran (px). */
  W = 400;
  H = 200;
  rink: Rink | null = null;
  /** Match en cours, ou démo derrière les menus. */
  state: MatchState | null = null;
  ecranUI: EcranUI = 'menu';
  /** Pause solo (en Wi-Fi, la pause est partagée : voir `lan.pause`). */
  enPause = false;
  /** Zones cliquables de l'image en cours (remplies au rendu). */
  boutons: ZoneBouton[] = [];
  /** Temps de simulation en attente (pas fixe). */
  cumul = 0;
  readonly pref: Preferences = chargePreferences();
  readonly sprites = new BanqueSprites();
  readonly audio = new MoteurAudio();
  readonly effets = new SystemeEffets();
  readonly entrees = new GestionnaireEntreesJeu();
  readonly ralenti = new Ralenti();
  readonly imageFin = new ImageFinMatch();
  /** Les deux équipes actuellement affichées (match en cours, ou paire par défaut en démo/menu). */
  equipesActuelles: [EquipeVisuelle, EquipeVisuelle] = [
    resoutEquipe(trouveTeamDef(this.pref.equipeJoueur), 'interieur'),
    resoutEquipe(equipeAdverseParDefaut(this.pref.equipeJoueur), 'interieur'),
  ];

  // ------------------------------------------------------------- parcours
  readonly solo = new ParcoursSolo(this);
  readonly coupe = new ParcoursCoupe(this);
  readonly lan = new ParcoursLan(this);

  constructor(canvas: HTMLCanvasElement) {
    this.ecran = canvas;
    this.g = canvas.getContext('2d')!;
  }

  async demarre(): Promise<void> {
    // Les sprites sont chargés en parallèle du premier rendu ; tant qu'ils ne
    // sont pas prêts, dessinePatineur/dessineGardien sautent juste le
    // drawImage (aucune erreur), donc on ne bloque pas l'affichage dessus.
    void this.sprites.charge().then(() => this.prechargeTouteLaSelection());
    this.imageFin.charge();
    this.effets.definitEquipes(this.equipesActuelles);
    this.effets.intensiteEcran = this.pref.secoussesReduites ? 0.4 : 1;

    this.attacheEvenements();
    this.dispose();
    if (this.portrait) {
      // on prépare quand même une patinoire paysage pour la démo derrière l'écran "tournez votre téléphone"
      const w = this.W;
      const h = this.H;
      this.W = Math.max(w, h);
      this.H = Math.min(w, h);
      this.placePatinoire();
      this.W = w;
      this.H = h;
    }
    this.creeDemo();
    this.dernier = performance.now();
    requestAnimationFrame((t) => this.boucle(t));
  }

  // -------------------------------------------------------------- disposition

  private dispose(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const dw = Math.round(window.innerWidth * dpr);
    const dh = Math.round(window.innerHeight * dpr);
    this.ecran.width = dw;
    this.ecran.height = dh;
    this.portrait = window.innerHeight > window.innerWidth * 1.05;
    this.ECHELLE = Math.max(1, Math.floor(this.portrait ? Math.min(dh / 360, dw / 180) : Math.min(dh / 196, dw / 360)));
    this.W = Math.ceil(dw / this.ECHELLE);
    this.H = Math.ceil(dh / this.ECHELLE);
    // redimensionner le canevas remet son état à zéro
    this.g.imageSmoothingEnabled = false;
    if (!this.portrait) this.placePatinoire();
  }

  private placePatinoire(): void {
    const ancien = this.rink;
    const nouveau = calculeRink(this.W, this.H);
    this.rink = nouveau;
    if (ancien && this.state) {
      for (const s of this.state.patineurs) reprojette(ancien, nouveau, s);
      reprojette(ancien, nouveau, this.state.palet);
      for (const gk of this.state.gardiens) reprojette(ancien, nouveau, gk);
    }
    this.construitDecor();
  }

  /** À reconstruire à chaque changement de taille d'écran ou d'équipes (couleurs de la foule). */
  construitDecor(): void {
    if (!this.rink) return;
    const traces = new TracesGlace();
    traces.reinitialise(this.W, this.H);
    this.decor = {
      glace: construitGlace(this.rink, this.W, this.H),
      foule: construitFoule(this.rink, this.W, this.H, this.equipesActuelles),
      traces,
    };
  }

  /** Précharge toutes les combinaisons équipe×maillot d'un coup (fichiers minuscules, autant
   * les avoir toutes prêtes avant que le joueur n'atteigne l'écran des maillots). */
  private prechargeTouteLaSelection(): void {
    for (const def of EQUIPES_JOUABLES) {
      void this.sprites.precharge(`${def.id}-interieur`);
      void this.sprites.precharge(`${def.id}-exterieur`);
    }
  }

  // ---------------------------------------------------------------- parties

  /** Démo (3 contre 3 entre ordinateurs) derrière les menus. */
  creeDemo(): void {
    this.state = creePartie(this.rink!, { mode: 'demo', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  }

  retourMenu(): void {
    this.coupe.matchCoupe = false;
    this.creeDemo();
    this.ecranUI = 'menu';
    this.enPause = false;
    this.effets.reinitialise();
  }

  pause(oui: boolean): void {
    if (this.lan.jeu) {
      if (oui) this.lan.demandePause();
      return;
    }
    if (this.ecranUI !== 'jeu' && this.ecranUI !== 'pause') return;
    this.enPause = oui;
    this.ecranUI = oui ? 'pause' : 'jeu';
    this.entrees.reinitialise();
  }

  /** Match terminé (détecté dans l'état de jeu) : écran de fin, résultat de coupe, vote en Wi-Fi. */
  surFinMatch(): void {
    this.ecranUI = 'fin';
    this.enPause = false;
    this.entrees.reinitialise();
    // victoire ou défaite, vue de ce joueur-ci (en Wi-Fi, chacun voit la sienne)
    this.imageFin.efface();
    const s = this.state;
    if (!s) return;
    const sc = s.score;
    if (sc[0] !== sc[1] && !this.lan.spectateur) {
      const moi = this.lan.eqLocal;
      this.imageFin.montre(sc[moi] > sc[moi === 0 ? 1 : 0]);
    }
    if (this.lan.jeu) this.lan.finMatch(s);
    else this.coupe.noteMatch(s);
  }

  // ------------------------------------------------ ralenti des buts

  demarreRalenti(options: OptionsPartie): void {
    this.optionsMatch = options;
    this.etatRalenti = null;
    this.ralenti.reinitialise();
  }

  /** À chaque image de match : enregistre (hôte/solo), fait avancer la lecture et prépare l'image du ralenti. */
  majRalenti(state: MatchState, dt: number, enregistre: boolean): void {
    if (state.mode !== 'match' || !this.rink) return;
    if (enregistre) {
      const inst = decodeInstantane(encodeInstantane(state, this.rink, 0));
      if (inst) this.ralenti.enregistre(inst);
    }
    this.ralenti.maj(state, dt, this.lan.pause || this.enPause);
    if (this.ralenti.actif && this.optionsMatch) {
      this.etatRalenti ??= creePartie(this.rink, this.optionsMatch);
      this.ralenti.applique(this.etatRalenti, this.rink);
    }
  }

  /** PASSER : en solo tout de suite ; en Wi-Fi, le jeu reprend quand les deux ont passé. */
  private passeRalenti(): void {
    if (!this.ralenti.actif) return;
    if (this.lan.jeu) {
      this.lan.agit({ a: 'passer' });
      return;
    }
    this.ralenti.arrete();
    if (this.state?.phase === 'but') this.state.phaseT = Math.min(this.state.phaseT, 0.4);
  }

  // ----------------------------------------------------------------- entrées

  private versLogique(e: PointerEvent): PointLogique {
    const r = this.ecran.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * (this.ecran.width / this.ECHELLE),
      y: ((e.clientY - r.top) / r.height) * (this.ecran.height / this.ECHELLE),
    };
  }

  private surAppui(e: PointerEvent): void {
    e.preventDefault();
    this.audio.init();
    // souris : le pointerdown suffit comme geste ; doigt : voir pointerup
    if (e.pointerType === 'mouse') this.pleinEcran.tente();
    // premier geste sur le menu : rien que le plein écran, aucun bouton ne réagit
    if (this.attenteDemarrage && this.ecranUI === 'menu') {
      this.attenteDemarrage = false;
      return;
    }
    const p = this.versLogique(e);
    if (this.portrait) return;
    const lan = this.lan;
    if (this.ecranUI === 'jeu' && this.ralenti.actif && !lan.pause) {
      const b = clicSurBouton(this.boutons, p.x, p.y);
      if (b) {
        this.audio.clic();
        b.act();
        return;
      }
    }
    if (this.ecranUI === 'jeu' && lan.spectateur) {
      // le spectateur ne pilote rien : ses appuis vont aux réactions (ou au bouton QUITTER de la pause)
      clicSurBouton(this.boutons, p.x, p.y)?.act();
      return;
    }
    if (this.ecranUI === 'jeu' && !this.enPause && !lan.pause) {
      if (this.entrees.pointeSurPause(p, this.W)) {
        this.pause(true);
        return;
      }
      this.entrees.onPointerDown(e.pointerId, p, this.W, this.H, e.pointerType === 'touch');
      try {
        this.ecran.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    // image de victoire / défaite : un appui la passe, sans toucher aux boutons dessous
    if (this.ecranUI === 'fin' && this.imageFin.seule()) {
      this.imageFin.passe();
      return;
    }
    const b = clicSurBouton(this.boutons, p.x, p.y);
    if (b) {
      this.audio.clic();
      b.act();
    }
  }

  private surTouche(e: KeyboardEvent): void {
    if (!e.repeat) this.audio.init();
    if (e.code !== 'Escape') this.pleinEcran.tente();
    // premier geste sur le menu : rien que le plein écran, aucune touche ne réagit
    if (this.attenteDemarrage && this.ecranUI === 'menu') {
      this.attenteDemarrage = false;
      return;
    }
    this.entrees.onKeyDown(e);
    if (this.entrees.pauseDemandee) {
      this.entrees.pauseDemandee = false;
      if (this.ecranUI === 'jeu') this.pause(true);
    }
    // l'écran au moment de l'appui : une touche ne déclenche qu'une action,
    // même si la première change d'écran
    const ecran = this.ecranUI;
    if (e.code === 'Enter') {
      if (ecran === 'fin' && this.imageFin.seule()) this.imageFin.passe();
      else if (ecran === 'fin' && this.lan.jeu) this.lan.agit({ a: 'vote', vote: 'rejouer' });
      else if (ecran === 'fin' && this.coupe.matchCoupe) this.coupe.ouvreTableau();
      else if (ecran === 'fin') this.solo.rejoue();
      else if (ecran === 'jeu' && this.lan.pause) this.lan.agit({ a: 'pause', on: false });
      else if (ecran === 'jeu' && this.ralenti.actif) this.passeRalenti();
      else if (ecran === 'pause') this.pause(false);
    }
    this.solo.touche(e, ecran);
    this.coupe.touche(e, ecran);
    this.lan.touche(e, ecran);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }

  private attacheEvenements(): void {
    this.ecran.addEventListener('pointerdown', (e) => this.surAppui(e), { passive: false });
    this.ecran.addEventListener('pointermove', (e) => {
      this.entrees.onPointerMove(e.pointerId, this.versLogique(e));
    });
    const relache = (e: PointerEvent) => this.entrees.onPointerUp(e.pointerId);
    this.ecran.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') this.pleinEcran.tente();
      relache(e);
    });
    this.ecran.addEventListener('pointercancel', relache);
    this.ecran.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.surTouche(e));
    window.addEventListener('keyup', (e) => this.entrees.onKeyUp(e));

    window.addEventListener('resize', () => this.dispose());
    window.addEventListener('orientationchange', () => setTimeout(() => this.dispose(), 120));
    document.addEventListener('visibilitychange', () => {
      // téléphone verrouillé ou appli en arrière-plan : pause (partagée en réseau)
      if (document.hidden && this.ecranUI === 'jeu') this.pause(true);
    });
    // onglet fermé : on retire l'annonce et on prévient l'autre joueur tout de suite
    window.addEventListener('pagehide', () => this.lan.ferme());
  }

  // ------------------------------------------------------------------ boucle

  private boucle(t: number): void {
    const dt = Math.min(0.05, (t - this.dernier) / 1000);
    this.dernier = t;
    const state = this.state;
    const lan = this.lan;
    const reseau = lan.jeu;
    lan.avanceHote(dt, state);
    if (reseau?.role === 'client') {
      lan.boucleClient(dt);
    } else if ((!this.portrait || reseau) && (!this.enPause || reseau) && state && this.rink) {
      // en réseau, l'hôte ne met jamais la simulation en pause : l'autre joueur continue
      const hote = reseau ? lan.hote : null;
      const maintenant = performance.now() / 1000;
      const entree = (eq: TeamId): InputIntent =>
        eq === 0 ? this.entrees.consomme() : hote ? hote.entreeInvite(maintenant) : INTENT_VIDE;
      // pause partagée : la simulation est figée pour les deux joueurs
      this.cumul = lan.pause ? 0 : this.cumul + dt;
      while (this.cumul >= PAS_FIXE) {
        pas(this.rink, state, PAS_FIXE, entree);
        this.cumul -= PAS_FIXE;
      }
      if (state.evenements.length) {
        lan.diffuseEvenements(state);
        joueEvenements(this.audio, state.evenements);
        this.effets.traite(state.evenements);
        state.evenements.length = 0;
      }
      lan.diffuseInstantane(state, this.rink, t);
      this.effets.maj(dt);
      lan.arbitreRalenti(state);
      this.majRalenti(state, dt, state.dureeBut > DUREE_BUT);
      if (state.phase === 'fin' && state.mode === 'match' && this.ecranUI !== 'fin') {
        this.surFinMatch();
        if (!reseau) this.solo.persisteFinMatch(state.score[0] > state.score[1]);
      }
    }
    this.rendu();
    requestAnimationFrame((t2) => this.boucle(t2));
  }

  private rendu(): void {
    this.boutons = [];
    const g = this.g;
    const E = this.ECHELLE;
    g.setTransform(E, 0, 0, E, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const temps = performance.now() / 1000;

    if (this.portrait || !this.state || !this.rink || !this.decor) {
      dessinePortrait(g, this.W, this.H, temps);
      return;
    }
    const state = this.state;
    const lan = this.lan;
    g.fillStyle = C.nuit;
    g.fillRect(0, 0, this.W, this.H);
    const s = this.effets.secousse;
    const sx = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    const sy = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    g.setTransform(E, 0, 0, E, sx * E, sy * E);
    const ralenti = this.ralenti.actif && !!this.etatRalenti && this.ecranUI === 'jeu';
    dessineScene(
      g,
      this.rink,
      ralenti ? this.etatRalenti! : state,
      this.decor,
      this.sprites,
      this.effets,
      this.ecranUI,
      this.equipesActuelles,
      lan.spectateur ? null : lan.eqLocal,
    );
    g.setTransform(E, 0, 0, E, 0, 0);
    const enMatch = !ECRANS_MENU.includes(this.ecranUI);
    // empilement lors d'un but : patinoire, écusson géant, puis tableau et bandeau
    if (enMatch) {
      if (!ralenti) dessineLogoBut(g, this.W, this.H, this.rink, this.effets.banniere, this.ecranUI, temps);
      if (!ralenti) dessineJaugesBonus(g, this.W, state, lan.spectateur ? null : lan.eqLocal, temps, !this.entrees.tactile);
      dessineTableau(g, this.W, state, this.ecranUI, this.equipesActuelles);
    }
    if (!ralenti && (this.ecranUI === 'menu' || enMatch)) dessineBanniere(g, this.W, this.rink, this.effets.banniere, this.ecranUI);
    // le buteur qui fête son but passe au premier plan, devant l'écusson et le bandeau
    if (!ralenti && enMatch) dessineCelebration(g, this.W, this.H, this.sprites, this.effets.banniere, this.ecranUI);
    if (enMatch) lan.vues.dessineEtatReseau(g, temps);

    if (this.ecranUI === 'jeu') this.dessineSurMatch(g, temps, state, ralenti);
    else if (this.ecranUI === 'fin' && this.imageFin.dessine(g, this.W, this.H, this.equipesActuelles[lan.eqLocal]) && this.imageFin.seule()) {
      // image de victoire / défaite seule, avant que les statistiques s'y superposent
    } else {
      // chaque parcours dessine ses écrans (le Wi-Fi d'abord : il a aussi sa fin de match)
      void (lan.vues.dessine(g, temps, state) || this.coupe.dessine(g, temps) || this.solo.dessine(g, temps, state));
    }
    lan.vues.dessineCoupure(g, temps);
    lan.vues.dessineReactions(g, temps);
    if (this.effets.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.effets.flash * 0.5})`;
      g.fillRect(0, 0, this.W, this.H);
    }
    if (this.attenteDemarrage && this.ecranUI === 'menu') this.dessineEcranDemarrage(g, temps);
  }

  /**
   * Premier écran, par-dessus le menu : un seul geste (clic, appui, touche)
   * suffit à passer en plein écran, avant que le joueur touche un vrai
   * bouton. Voir `attenteDemarrage`.
   */
  private dessineEcranDemarrage(g: CanvasRenderingContext2D, temps: number): void {
    const cx = Math.round(this.W / 2);
    const cy = Math.round(this.H / 2);
    g.fillStyle = 'rgba(5,6,13,0.82)';
    g.fillRect(0, 0, this.W, this.H);
    const pulse = Math.sin(temps * 5) > 0;
    texte(g, 'APPUYEZ POUR COMMENCER', cx, cy - 5, pulse ? C.or : C.blanc, 2, 'c');
    texte(g, 'LE JEU PASSE EN PLEIN ECRAN', cx, cy + 15, '#6f7aa6', 1, 'c');
  }

  /** Par-dessus le match : pause Wi-Fi, ralenti du but, ou commandes tactiles. */
  private dessineSurMatch(g: CanvasRenderingContext2D, temps: number, state: MatchState, ralenti: boolean): void {
    const lan = this.lan;
    this.entrees.bonusVisible = false;
    if (lan.vues.dessinePauseMatch(g)) return;
    if (ralenti) {
      const partie = lan.partie;
      const enLan = !!partie && !!lan.jeu;
      const passe = enLan && partie!.ralentiPasse[lan.place];
      const autre = partie?.joueurs[lan.place === 0 ? 1 : 0];
      dessineRalenti(g, this.boutons, this.W, this.H, temps, {
        progression: this.ralenti.progression,
        // le spectateur ne passe pas le ralenti : les joueurs décident
        attente: lan.spectateur ? 'RALENTI DU BUT' : passe ? `EN ATTENTE DE ${autre?.nom ?? ''}` : null,
        onPasser: () => this.passeRalenti(),
      });
      return;
    }
    // le spectateur n'a pas de commandes : sa barre de réactions est dessinée à part
    if (lan.spectateur) return;
    const pilote = state.controles[lan.eqLocal];
    const ui = this.entrees.instantaneUI();
    dessineCommandes(g, this.W, this.H, state.temps, pilote, ui, !!pilote && menaceEchec(state, pilote) !== null);
    // bonus prêt : son bouton apparaît au-dessus de PASSE (et sa zone tactile s'active)
    const pret = pouvoirPret(state, lan.eqLocal) ? state.pouvoirs![lan.eqLocal].pret : null;
    if (pret && ui.tactile && pilote) {
      this.entrees.bonusVisible = true;
      dessineBoutonBonus(g, this.W, this.H, state.temps, pret, ui.bonusActif);
    }
    if (pilote?.arme) dessineJaugeTir(g, this.H, pilote.charge, state.temps);
  }
}
