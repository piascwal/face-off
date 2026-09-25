import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import { calculeRink, reprojette } from '@core/rink';
import { creePartie } from '@core/rules';
import { pas } from '@core/simulation';
import { trouveEquipe } from '@core/teams';
import type { MatchState, Rink } from '@core/types';
import { joueEvenements, MoteurAudio } from '@audio/sound';
import { GestionnaireEntreesJeu, type PointLogique } from '@input/game-input';
import {
  BanqueSprites,
  C,
  clicSurBouton,
  construitFoule,
  construitGlace,
  dessineBanniere,
  dessineCommandes,
  dessineFin,
  dessineMenu,
  dessinePause,
  dessinePortrait,
  dessineScene,
  dessineSelectionEquipe,
  dessineTableau,
  EQUIPES_VISUELLES,
  SystemeEffets,
  TracesGlace,
  trouveEquipeVisuelle,
  type CarteEquipe,
  type DecorPatinoire,
  type EquipeVisuelle,
  type EtatFin,
  type EtatMenu,
  type EtatSelectionEquipe,
  type ZoneBouton,
} from '@render/index';
import { chargePreferences, sauvePreferences, type Preferences } from './preferences';
import { demandePleinEcranPaysage } from './pwa';

const PAS_FIXE = 1 / 120;

type EcranUI = 'menu' | 'equipes' | 'jeu' | 'pause' | 'fin';

/** Adversaire suggéré par défaut au démarrage / en démo, avant tout choix réel. */
function equipeAdverseParDefaut(idJoueur: string): EquipeVisuelle {
  return trouveEquipeVisuelle(idJoueur === 'montpellier' ? 'toulouse' : 'montpellier');
}

export class GameApp {
  private readonly ecran: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;

  private W = 400;
  private H = 200;
  private ECHELLE = 1;
  private portrait = false;
  private rink: Rink | null = null;
  private decor: DecorPatinoire | null = null;

  private readonly sprites = new BanqueSprites();
  private readonly audio = new MoteurAudio();
  private readonly effets = new SystemeEffets();
  private readonly entrees = new GestionnaireEntreesJeu();
  private readonly pref: Preferences = chargePreferences();

  /** Les deux équipes actuellement affichées (match en cours, ou paire par défaut en démo/menu). */
  private equipesActuelles: [EquipeVisuelle, EquipeVisuelle] = [
    trouveEquipeVisuelle(this.pref.equipeJoueur),
    equipeAdverseParDefaut(this.pref.equipeJoueur),
  ];
  private etapeSelection: 'joueur' | 'adversaire' = 'joueur';
  private equipeJoueurChoisie: EquipeVisuelle | null = null;

  private state: MatchState | null = null;
  private ecranUI: EcranUI = 'menu';
  private enPause = false;
  private boutons: ZoneBouton[] = [];

  private cumul = 0;
  private dernier = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ecran = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.g = this.bas.getContext('2d')!;
  }

  async demarre(): Promise<void> {
    // Les sprites sont chargés en parallèle du premier rendu ; tant qu'ils ne
    // sont pas prêts, dessinePatineur/dessineGardien sautent juste le
    // drawImage (aucune erreur), donc on ne bloque pas l'affichage dessus.
    void this.sprites.charge().then(() => this.prechargeEquipes());
    this.effets.definitEquipes(this.equipesActuelles);

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
    this.bas.width = this.W;
    this.bas.height = this.H;
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
  private construitDecor(): void {
    if (!this.rink) return;
    const traces = new TracesGlace();
    traces.reinitialise(this.W, this.H);
    this.decor = {
      glace: construitGlace(this.rink, this.W, this.H),
      foule: construitFoule(this.rink, this.W, this.H, this.equipesActuelles),
      traces,
    };
  }

  private prechargeEquipes(): void {
    for (const eq of this.equipesActuelles) void this.sprites.precharge(eq.id);
  }

  // ---------------------------------------------------------------- parties

  private creeDemo(): void {
    this.state = creePartie(this.rink!, { mode: 'demo', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  }

  private ouvreSelectionEquipe(): void {
    this.audio.init();
    this.etapeSelection = 'joueur';
    this.equipeJoueurChoisie = null;
    this.ecranUI = 'equipes';
  }

  private choisitEquipeJoueur(id: string): void {
    this.audio.clic();
    this.pref.equipeJoueur = id;
    sauvePreferences(this.pref);
    this.equipeJoueurChoisie = trouveEquipeVisuelle(id);
    this.etapeSelection = 'adversaire';
  }

  private choisitEquipeAdversaire(id: string): void {
    if (!this.equipeJoueurChoisie) return;
    this.audio.clic();
    this.lanceMatch(this.equipeJoueurChoisie, trouveEquipeVisuelle(id));
  }

  private retourChoixJoueur(): void {
    this.audio.clic();
    this.etapeSelection = 'joueur';
    this.equipeJoueurChoisie = null;
  }

  private lanceMatch(equipeJoueur: EquipeVisuelle, equipeAdverse: EquipeVisuelle): void {
    this.audio.init();
    demandePleinEcranPaysage();
    this.equipesActuelles = [equipeJoueur, equipeAdverse];
    this.effets.definitEquipes(this.equipesActuelles);
    this.prechargeEquipes();
    this.construitDecor();
    this.state = creePartie(this.rink!, {
      mode: 'match',
      niveauIdx: this.pref.niveau,
      dureeIdx: this.pref.duree,
      effectifIdx: this.pref.effectif,
      equipeJoueur: trouveEquipe(equipeJoueur.id),
      equipeAdverse: trouveEquipe(equipeAdverse.id),
    });
    this.effets.reinitialise();
    this.ecranUI = 'jeu';
    this.enPause = false;
    this.effets.annonce('PRETS ?', NIVEAUX[this.pref.niveau]!.nom, C.blanc, 1.5);
  }

  /** Rejoue immédiatement avec les deux mêmes équipes (pas de repassage par la sélection). */
  private rejoue(): void {
    this.lanceMatch(this.equipesActuelles[0], this.equipesActuelles[1]);
  }

  private retourMenu(): void {
    this.creeDemo();
    this.ecranUI = 'menu';
    this.enPause = false;
    this.effets.reinitialise();
  }

  private pause(oui: boolean): void {
    if (this.ecranUI !== 'jeu' && this.ecranUI !== 'pause') return;
    this.enPause = oui;
    this.ecranUI = oui ? 'pause' : 'jeu';
    this.entrees.reinitialise();
  }

  private persisteFinMatch(gagne: boolean): void {
    const n = this.pref.niveau;
    this.pref.matchs[n] = (this.pref.matchs[n] ?? 0) + 1;
    if (gagne) this.pref.victoires[n] = (this.pref.victoires[n] ?? 0) + 1;
    sauvePreferences(this.pref);
  }

  // ----------------------------------------------------------------- entrées

  private versLogique(e: PointerEvent): PointLogique {
    const r = this.ecran.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * (this.ecran.width / this.ECHELLE),
      y: ((e.clientY - r.top) / r.height) * (this.ecran.height / this.ECHELLE),
    };
  }

  private attacheEvenements(): void {
    this.ecran.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.audio.init();
        const p = this.versLogique(e);
        if (this.portrait) return;
        if (this.ecranUI === 'jeu' && !this.enPause) {
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
        const b = clicSurBouton(this.boutons, p.x, p.y);
        if (b) {
          this.audio.clic();
          b.act();
        }
      },
      { passive: false },
    );
    this.ecran.addEventListener('pointermove', (e) => {
      this.entrees.onPointerMove(e.pointerId, this.versLogique(e));
    });
    const relache = (e: PointerEvent) => this.entrees.onPointerUp(e.pointerId);
    this.ecran.addEventListener('pointerup', relache);
    this.ecran.addEventListener('pointercancel', relache);
    this.ecran.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.audio.init();
      this.entrees.onKeyDown(e);
      if (this.entrees.pauseDemandee) {
        this.entrees.pauseDemandee = false;
        if (this.ecranUI === 'jeu') this.pause(true);
      }
      if (e.code === 'Enter') {
        if (this.ecranUI === 'menu') this.ouvreSelectionEquipe();
        else if (this.ecranUI === 'fin') this.rejoue();
        else if (this.enPause) this.pause(false);
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.entrees.onKeyUp(e));

    window.addEventListener('resize', () => this.dispose());
    window.addEventListener('orientationchange', () => setTimeout(() => this.dispose(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ecranUI === 'jeu') this.pause(true);
    });
  }

  // ------------------------------------------------------------------ boucle

  private boucle(t: number): void {
    const dt = Math.min(0.05, (t - this.dernier) / 1000);
    this.dernier = t;
    const state = this.state;
    if (!this.portrait && !this.enPause && state && this.rink) {
      this.cumul += dt;
      while (this.cumul >= PAS_FIXE) {
        pas(this.rink, state, PAS_FIXE, () => this.entrees.consomme());
        this.cumul -= PAS_FIXE;
      }
      if (state.evenements.length) {
        joueEvenements(this.audio, state.evenements);
        this.effets.traite(state.evenements);
        state.evenements.length = 0;
      }
      this.effets.maj(dt);
      if (state.phase === 'fin' && this.ecranUI !== 'fin') {
        this.ecranUI = 'fin';
        this.enPause = false;
        this.entrees.reinitialise();
        this.persisteFinMatch(state.score[0] > state.score[1]);
      }
    }
    this.rendu();
    requestAnimationFrame((t2) => this.boucle(t2));
  }

  private rendu(): void {
    this.boutons = [];
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const tempsUI = performance.now() / 1000;

    if (this.portrait || !this.state || !this.rink || !this.decor) {
      dessinePortrait(g, this.W, this.H, tempsUI);
    } else {
      const state = this.state;
      g.fillStyle = C.nuit;
      g.fillRect(0, 0, this.W, this.H);
      const s = this.effets.secousse;
      const sx = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
      const sy = s > 0.2 ? Math.round((Math.random() * 2 - 1) * s) : 0;
      g.setTransform(1, 0, 0, 1, sx, sy);
      dessineScene(g, this.rink, state, this.decor, this.sprites, this.effets, this.ecranUI, this.equipesActuelles);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (this.ecranUI !== 'menu' && this.ecranUI !== 'equipes') dessineTableau(g, this.W, state, this.ecranUI, this.equipesActuelles);
      dessineBanniere(g, this.W, this.rink, this.effets.banniere, this.ecranUI);
      if (this.ecranUI === 'jeu') {
        dessineCommandes(g, this.W, this.H, state.temps, state.controle, this.entrees.instantaneUI());
      } else if (this.ecranUI === 'menu') {
        dessineMenu(g, this.boutons, this.W, this.H, tempsUI, this.menuProps());
      } else if (this.ecranUI === 'equipes') {
        dessineSelectionEquipe(g, this.boutons, this.W, this.H, this.selectionProps());
      } else if (this.ecranUI === 'pause') {
        dessinePause(g, this.boutons, this.W, this.H, () => this.pause(false), () => this.retourMenu());
      } else if (this.ecranUI === 'fin') {
        dessineFin(g, this.boutons, this.W, this.H, tempsUI, this.finProps(state));
      }
      if (this.effets.flash > 0) {
        g.fillStyle = `rgba(255,255,255,${this.effets.flash * 0.5})`;
        g.fillRect(0, 0, this.W, this.H);
      }
    }

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.bas, 0, 0, this.W * this.ECHELLE, this.H * this.ECHELLE);
  }

  private menuProps(): EtatMenu {
    return {
      niveauIdx: this.pref.niveau,
      dureeIdx: this.pref.duree,
      effectifIdx: this.pref.effectif,
      son: this.pref.son,
      victoires: this.pref.victoires[this.pref.niveau] ?? 0,
      matchs: this.pref.matchs[this.pref.niveau] ?? 0,
      tactile: this.entrees.tactile,
      onNiveau: () => {
        this.pref.niveau = (this.pref.niveau + 1) % NIVEAUX.length;
        sauvePreferences(this.pref);
      },
      onDuree: () => {
        this.pref.duree = (this.pref.duree + 1) % DUREES.length;
        sauvePreferences(this.pref);
      },
      onEffectif: () => {
        this.pref.effectif = (this.pref.effectif + 1) % EFFECTIFS.length;
        sauvePreferences(this.pref);
      },
      onSon: () => {
        this.pref.son = !this.pref.son;
        this.audio.muet(!this.pref.son);
        sauvePreferences(this.pref);
      },
      onJouer: () => this.ouvreSelectionEquipe(),
    };
  }

  private selectionProps(): EtatSelectionEquipe {
    const cartes: CarteEquipe[] = EQUIPES_VISUELLES.map((visuel) => ({ visuel, profil: trouveEquipe(visuel.id) }));
    return {
      etape: this.etapeSelection,
      cartes,
      equipeJoueur: this.equipeJoueurChoisie,
      onChoisir: (id) => {
        if (this.etapeSelection === 'joueur') this.choisitEquipeJoueur(id);
        else this.choisitEquipeAdversaire(id);
      },
      onRetour: () => this.retourChoixJoueur(),
    };
  }

  private finProps(state: MatchState): EtatFin {
    return {
      score: state.score,
      tirs: state.tirs,
      prolong: state.prolong,
      niveauNom: NIVEAUX[this.pref.niveau]!.nom,
      victoires: this.pref.victoires[this.pref.niveau] ?? 0,
      matchs: this.pref.matchs[this.pref.niveau] ?? 0,
      equipes: this.equipesActuelles,
      onRejouer: () => this.rejoue(),
      onMenu: () => this.retourMenu(),
    };
  }
}
