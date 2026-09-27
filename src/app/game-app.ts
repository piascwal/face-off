import { menaceEchec } from '@core/actions';
import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import { calculeRink, reprojette } from '@core/rink';
import { creePartie, DUREE_BUT, type OptionsPartie } from '@core/rules';
import { pas } from '@core/simulation';
import { trouveEquipe } from '@core/teams';
import { coupeTerminee, creeCoupe, enregistreResultat, matchDuJoueur, niveauDuTour, NOMS_TOURS } from '@core/coupe';
import { BONUS_EQUIPE, INTENT_VIDE, type InputIntent, type MatchState, type Rink, type TeamId } from '@core/types';
import type { AnnoncePartie } from '@net/annuaire';
import {
  estReaction,
  maillotsIdentiques,
  type ActionLan,
  type ConfigLan,
  type EtatPartieLan,
  type JoueurLan,
  type PhaseLan,
  type Place,
} from '@net/partie';
import { angleVersHote, decodeInstantane, directionVersHote, encodeInstantane, evenementsPourEnvoi, type MsgCtrl } from '@net/protocole';
import { SessionClient, SessionHote, type RaisonFin } from '@net/session';
import { SynchroClient } from '@net/synchro';
import { joueEvenements, MoteurAudio } from '@audio/sound';
import { GestionnaireEntreesJeu, type PointLogique } from '@input/game-input';
import {
  BanqueSprites,
  C,
  clicSurBouton,
  construitFoule,
  construitGlace,
  dessineBanniere,
  dessineCelebration,
  repeintImageFin,
  dessineLogoBut,
  dessineAvance,
  dessineChoixMaillots,
  dessineCommandes,
  dessineChoixLan,
  dessineConfigLan,
  dessineAttenteSpectateur,
  dessineBarreReactions,
  dessineFinLan,
  dessineFinSpectateur,
  dessineLan,
  dessineReactions,
  dessinePauseLan,
  dessineRepriseLan,
  dessineSalon,
  dessineFin,
  dessineMenu,
  dessinePause,
  dessinePortrait,
  dessineRalenti,
  dessineScene,
  dessineSelectionEquipe,
  dessineJaugeTir,
  dessineTableau,
  dessineChoixCoupe,
  dessineTableauCoupe,
  etapesRevelation,
  etapesVues,
  palette,
  varianteAdverse,
  type Revelation,
  CODES_REACTIONS,
  EQUIPES_JOUABLES,
  REACTION_VIE_S,
  REACTIONS_MAX,
  resoutEquipe,
  SystemeEffets,
  TracesGlace,
  trouveTeamDef,
  type CarteEquipe,
  type CoteMaillot,
  type DecorPatinoire,
  type EquipeVisuelle,
  type EtatAvance,
  type EtatChoixMaillots,
  type EtatFin,
  type CoteChoixLan,
  type EtatChoixLan,
  type EtatConfigLan,
  type EtatFinLan,
  type EtatLan,
  type EtatSalon,
  type ReactionAffichee,
  type ResumeConfig,
  type StatutLan,
  type EtatMenu,
  type EtatSelectionEquipe,
  texte,
  type TeamDef,
  type Variante,
  type ZoneBouton,
} from '@render/index';
import { chargePreferences, noteDuel, sauvePreferences, type Preferences } from './preferences';
import { dureeBut, Ralenti } from './ralenti';
import { demandePleinEcranPaysage, PleinEcranAuPremierGeste } from './pwa';

const PAS_FIXE = 1 / 120;

/** Durée d'affichage de l'image de victoire / défaite avant les statistiques (s). */
const IMAGE_FIN_S = 2;

type EcranUI = 'menu' | 'avance' | 'equipes' | 'maillots' | 'coupeChoix' | 'coupe' | 'lan' | 'lanConfig' | 'salon' | 'lanChoix' | 'lanSpect' | 'jeu' | 'pause' | 'fin';

/** Écrans de menu plein cadre : ni tableau d'affichage ni bandeau par-dessus. */
const ECRANS_MENU: EcranUI[] = ['menu', 'avance', 'equipes', 'maillots', 'coupeChoix', 'coupe', 'lan', 'lanConfig', 'salon', 'lanChoix', 'lanSpect'];

/**
 * Match en réseau local : l'hôte simule (équipe 0), le client affiche et
 * envoie ses entrées (équipe 1) ; un spectateur affiche comme le client,
 * sans rien piloter.
 */
type JeuReseau =
  | { role: 'hote'; eqLocal: 0; dernierEnvoi: number }
  | { role: 'client'; eqLocal: 1; synchro: SynchroClient; spectateur: boolean };

function messageErreurReseau(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m === 'reseau') return 'WIFI NON DETECTE - VERIFIEZ LA CONNEXION';
  if (m.startsWith('aucun serveur')) return 'DECOUVERTE INDISPONIBLE - REESSAYEZ';
  if (m === 'complet') return 'CETTE PARTIE EST DEJA COMPLETE';
  if (m === 'spectateurs') return 'DEJA 4 SPECTATEURS SUR CETTE PARTIE';
  if (m === 'version') return "VERSIONS DIFFERENTES : METTEZ LE JEU A JOUR";
  if (m === 'injoignable') return "L'HOTE NE REPOND PAS";
  if (m === 'connexion impossible') return 'CONNEXION DIRECTE IMPOSSIBLE SUR CE WIFI';
  return 'ERREUR RESEAU - REESSAYEZ';
}

const MESSAGES_FIN_CLIENT: Record<RaisonFin, string> = {
  quitte: "L'HOTE A FERME LA PARTIE",
  exclu: "L'HOTE VOUS A EXCLU DE LA PARTIE",
  perdu: "CONNEXION PERDUE AVEC L'HOTE",
  complet: 'CETTE PARTIE EST DEJA COMPLETE',
  version: 'VERSIONS DIFFERENTES : METTEZ LE JEU A JOUR',
  injoignable: "L'HOTE NE REPOND PAS",
};

/** Adversaire suggéré par défaut au démarrage / en démo, avant tout choix réel. */
function equipeAdverseParDefaut(idJoueur: string): TeamDef {
  return trouveTeamDef(idJoueur === 'montpellier' ? 'toulouse' : 'montpellier');
}

export class GameApp {
  private readonly ecran: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /**
   * On dessine directement à la résolution de l'écran, avec une échelle de
   * base ECHELLE : décor, texte et HUD gardent leurs gros pixels logiques,
   * tandis que les sprites des joueurs (pixels de 36/56 px logique) gardent
   * tout leur détail.
   */
  private readonly g: CanvasRenderingContext2D;

  private W = 400;
  private H = 200;
  private ECHELLE = 1;
  private portrait = false;
  private rink: Rink | null = null;
  private decor: DecorPatinoire | null = null;

  private readonly sprites = new BanqueSprites();
  /** Image de fin de match (victoire / défaite), affichée juste avant les statistiques. */
  private readonly imagesFin = { victoire: new Image(), defaite: new Image() };
  /** Cartes de rôles des images de fin (maillot, bandes, empiècements), pour les repeindre. */
  private readonly rolesFin = { victoire: new Image(), defaite: new Image() };
  /** Image de fin repeinte aux couleurs de l'équipe du joueur (calculée à la fin du match). */
  private imageFinRepeinte: { cle: string; c: HTMLCanvasElement } | null = null;
  private imageFin: { gagne: boolean; t0: number; stats: boolean } | null = null;
  private readonly audio = new MoteurAudio();
  private readonly effets = new SystemeEffets();
  private readonly pleinEcran = new PleinEcranAuPremierGeste();
  private readonly entrees = new GestionnaireEntreesJeu();
  private readonly pref: Preferences = chargePreferences();

  /** Les deux équipes actuellement affichées (match en cours, ou paire par défaut en démo/menu). */
  private equipesActuelles: [EquipeVisuelle, EquipeVisuelle] = [
    resoutEquipe(trouveTeamDef(this.pref.equipeJoueur), 'interieur'),
    resoutEquipe(equipeAdverseParDefaut(this.pref.equipeJoueur), 'interieur'),
  ];
  private indexSelectionJoueur = 0;
  private indexSelectionAdversaire = 0;
  private varianteJoueur: Variante = 'interieur';
  private varianteAdversaire: Variante = 'interieur';
  /** Le match en cours est un match de la coupe (son résultat va au tableau). */
  private matchCoupe = false;
  /** Niveau de difficulté du match en cours (en coupe, il monte à chaque tour). */
  private niveauMatch = 1;
  /** Résultats de la coupe à dévoiler sur le tableau. */
  private revelation: Revelation | null = null;
  private etapesSonnees = 0;
  /** Abandon de la coupe à confirmer (jusqu'à cet instant, en s). */
  private confirmeAbandonJusqua = 0;

  private state: MatchState | null = null;
  private ecranUI: EcranUI = 'menu';
  private enPause = false;
  private boutons: ZoneBouton[] = [];

  private cumul = 0;
  private dernier = 0;

  // ------------------------------------------------ multijoueur Wi-Fi
  private hote: SessionHote | null = null;
  private client: SessionClient | null = null;
  private jeuReseau: JeuReseau | null = null;
  private lanStatut: StatutLan = 'recherche';
  private lanMessage: string | null = null;
  private salonMessage: { txt: string; jusqua: number } | null = null;
  /** Invalide les réponses asynchrones d'un écran réseau qu'on a déjà quitté. */
  private lanGeneration = 0;
  private seqInstantane = 0;
  /** Dernière phase de partie Wi-Fi appliquée à l'écran. */
  private phaseVue: PhaseLan | null = null;
  /** Client : instant (s) de fin du compte à rebours de reprise en cours. */
  private finReprise: number | null = null;
  /** Réactions (spectateurs, joueurs à la fin) qui montent le long du bord droit. */
  private reactions: ReactionAffichee[] = [];

  // ------------------------------------------------ ralenti des buts
  private readonly ralenti = new Ralenti();
  /** Options du match en cours, pour recréer un état d'affichage dédié au ralenti. */
  private optionsMatch: OptionsPartie | null = null;
  private etatRalenti: MatchState | null = null;
  private phaseHote: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.ecran = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.g = this.ctx;
  }

  async demarre(): Promise<void> {
    // Les sprites sont chargés en parallèle du premier rendu ; tant qu'ils ne
    // sont pas prêts, dessinePatineur/dessineGardien sautent juste le
    // drawImage (aucune erreur), donc on ne bloque pas l'affichage dessus.
    void this.sprites.charge().then(() => this.prechargeTouteLaSelection());
    this.imagesFin.victoire.src = `${import.meta.env.BASE_URL}fins/victoire.jpg`;
    this.imagesFin.defaite.src = `${import.meta.env.BASE_URL}fins/defaite.jpg`;
    this.rolesFin.victoire.src = `${import.meta.env.BASE_URL}fins/victoire-roles.png`;
    this.rolesFin.defaite.src = `${import.meta.env.BASE_URL}fins/defaite-roles.png`;
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

  /** Précharge les 12 combinaisons équipe×maillot d'un coup (fichiers minuscules, autant
   * les avoir toutes prêtes avant que le joueur n'atteigne l'écran des maillots). */
  private prechargeTouteLaSelection(): void {
    for (const def of EQUIPES_JOUABLES) {
      void this.sprites.precharge(`${def.id}-interieur`);
      void this.sprites.precharge(`${def.id}-exterieur`);
    }
  }

  // ---------------------------------------------------------------- parties

  private creeDemo(): void {
    this.state = creePartie(this.rink!, { mode: 'demo', niveauIdx: 1, dureeIdx: 1, effectifIdx: 1 });
  }

  private ouvreSelectionEquipe(): void {
    this.audio.init();
    this.indexSelectionJoueur = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === this.pref.equipeJoueur));
    this.indexSelectionAdversaire = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === this.equipesActuelles[1].teamId));
    this.ecranUI = 'equipes';
  }

  private ouvreAvance(): void {
    this.audio.clic();
    this.ecranUI = 'avance';
  }

  private fermeAvance(): void {
    this.audio.clic();
    this.ecranUI = 'menu';
  }

  private tourneJoueur(sens: 1 | -1): void {
    this.audio.clic();
    const n = EQUIPES_JOUABLES.length;
    this.indexSelectionJoueur = (this.indexSelectionJoueur + sens + n) % n;
  }

  private tourneAdversaire(sens: 1 | -1): void {
    this.audio.clic();
    const n = EQUIPES_JOUABLES.length;
    this.indexSelectionAdversaire = (this.indexSelectionAdversaire + sens + n) % n;
  }

  /** Étape 1 validée : les équipes sont fixées, on passe au choix des maillots. */
  private confirmeSelection(): void {
    this.audio.clic();
    const def = EQUIPES_JOUABLES[this.indexSelectionJoueur]!;
    this.pref.equipeJoueur = def.id;
    sauvePreferences(this.pref);
    this.varianteJoueur = 'interieur';
    this.varianteAdversaire = 'interieur';
    this.ecranUI = 'maillots';
  }

  private toggleVarianteJoueur(): void {
    this.audio.clic();
    this.varianteJoueur = this.varianteJoueur === 'interieur' ? 'exterieur' : 'interieur';
  }

  private toggleVarianteAdversaire(): void {
    this.audio.clic();
    this.varianteAdversaire = this.varianteAdversaire === 'interieur' ? 'exterieur' : 'interieur';
  }

  private retourChoixEquipes(): void {
    this.audio.clic();
    this.ecranUI = 'equipes';
  }

  /** Étape 2 validée : les maillots sont fixés, on lance le match. */
  private confirmeMaillots(): void {
    const defJoueur = EQUIPES_JOUABLES[this.indexSelectionJoueur]!;
    const defAdverse = EQUIPES_JOUABLES[this.indexSelectionAdversaire]!;
    this.lanceMatch(resoutEquipe(defJoueur, this.varianteJoueur), resoutEquipe(defAdverse, this.varianteAdversaire));
  }

  private lanceMatch(equipeJoueur: EquipeVisuelle, equipeAdverse: EquipeVisuelle, niveau = this.pref.niveau, sousTitre?: string): void {
    this.audio.init();
    this.matchCoupe = false;
    this.niveauMatch = niveau;
    void demandePleinEcranPaysage();
    this.equipesActuelles = [equipeJoueur, equipeAdverse];
    this.effets.definitEquipes(this.equipesActuelles);
    this.construitDecor();
    const options: OptionsPartie = {
      mode: 'match',
      niveauIdx: niveau,
      dureeIdx: this.pref.duree,
      effectifIdx: this.pref.effectif,
      equipeJoueur: trouveEquipe(equipeJoueur.teamId),
      equipeAdverse: trouveEquipe(equipeAdverse.teamId),
      assistTir: this.pref.assistTir,
      assistPasse: this.pref.assistPasse,
      changementAuto: this.pref.changementAuto,
      dureeBut: dureeBut(this.pref.ralentiButs),
    };
    this.demarreRalenti(options);
    this.state = creePartie(this.rink!, options);
    this.effets.reinitialise();
    this.ecranUI = 'jeu';
    this.enPause = false;
    this.effets.annonce('PRETS ?', sousTitre ?? NIVEAUX[niveau]!.nom, C.blanc, 1.5);
  }

  /** Rejoue immédiatement avec les deux mêmes équipes et maillots (pas de repassage par la sélection). */
  private rejoue(): void {
    this.lanceMatch(this.equipesActuelles[0], this.equipesActuelles[1]);
  }

  // ------------------------------------------------------------ mode coupe

  /** JOUER en mode coupe : reprend la coupe en cours, sinon choix de l'équipe. */
  private ouvreCoupe(): void {
    this.audio.init();
    if (this.pref.coupe) this.ouvreTableau();
    else this.ouvreChoixCoupe();
  }

  private ouvreChoixCoupe(): void {
    this.indexSelectionJoueur = Math.max(0, EQUIPES_JOUABLES.findIndex((e) => e.id === this.pref.equipeJoueur));
    this.varianteJoueur = 'interieur';
    this.ecranUI = 'coupeChoix';
  }

  private lanceCoupe(): void {
    this.audio.clic();
    const def = EQUIPES_JOUABLES[this.indexSelectionJoueur]!;
    this.pref.equipeJoueur = def.id;
    this.pref.coupe = creeCoupe(def.id, this.varianteJoueur, this.pref.niveau);
    sauvePreferences(this.pref);
    this.revelation = null;
    this.ouvreTableau();
  }

  private ouvreTableau(): void {
    if (this.state?.mode === 'match') this.creeDemo();
    this.matchCoupe = false;
    this.enPause = false;
    this.effets.reinitialise();
    this.imageFin = null;
    this.ecranUI = 'coupe';
    if (this.revelation && this.revelation.t0 === null) {
      this.revelation.t0 = performance.now() / 1000;
      this.etapesSonnees = 0;
    }
  }

  /** Match du tour contre l'adversaire du tableau, au niveau du tour. */
  private joueMatchCoupe(): void {
    const c = this.pref.coupe;
    const mj = c && matchDuJoueur(c);
    if (!c || !mj) return;
    const defJ = trouveTeamDef(c.equipe);
    const defA = trouveTeamDef(mj.adversaire);
    const eqJ = resoutEquipe(defJ, c.variante);
    const eqA = resoutEquipe(defA, varianteAdverse(palette(defJ, c.variante), defA));
    const niveau = niveauDuTour(c);
    this.revelation = null;
    this.lanceMatch(eqJ, eqA, niveau, `${NOMS_TOURS[c.tour]} - ${NIVEAUX[niveau]!.nom}`);
    this.matchCoupe = true;
  }

  /** Match de coupe terminé : le résultat entre au tableau, les autres matchs du tour se jouent. */
  private noteMatchCoupe(state: MatchState): void {
    const c = this.pref.coupe;
    if (!this.matchCoupe || !c) return;
    const tours = enregistreResultat(c, state.score[0], state.score[1], state.prolong);
    sauvePreferences(this.pref);
    this.revelation = { etapes: etapesRevelation(c, tours), t0: null };
  }

  private abandonneCoupe(): void {
    const t = performance.now() / 1000;
    if (t > this.confirmeAbandonJusqua) {
      this.confirmeAbandonJusqua = t + 3;
      return;
    }
    this.pref.coupe = null;
    sauvePreferences(this.pref);
    this.retourMenu();
  }

  /** Quitte le tableau : une coupe terminée est rangée (la prochaine partie en ouvre une nouvelle). */
  private quitteTableau(): void {
    if (this.pref.coupe && coupeTerminee(this.pref.coupe)) {
      this.pref.coupe = null;
      sauvePreferences(this.pref);
    }
    this.retourMenu();
  }

  private nouvelleCoupe(): void {
    this.pref.coupe = null;
    sauvePreferences(this.pref);
    this.ouvreChoixCoupe();
  }

  private passeRevelation(): void {
    const r = this.revelation;
    if (r?.t0 != null) r.t0 = -1e6;
  }

  private retourMenu(): void {
    this.matchCoupe = false;
    this.creeDemo();
    this.ecranUI = 'menu';
    this.enPause = false;
    this.effets.reinitialise();
  }

  // --------------------------------------------------- multijoueur Wi-Fi

  private get eqLocal(): TeamId {
    return this.jeuReseau?.eqLocal ?? 0;
  }

  /** État partagé de la partie Wi-Fi (l'original chez l'hôte, la copie reçue chez le client). */
  private get partieLan(): EtatPartieLan | null {
    return this.hote?.partie ?? this.client?.partie ?? null;
  }

  private get placeLan(): Place {
    return this.hote ? 0 : 1;
  }

  /** Cet appareil regarde la partie sans y jouer. */
  private get spectateur(): boolean {
    return !this.hote && !!this.client?.spectateur;
  }

  /** Toute action de partie passe par l'hôte, y compris celles de l'hôte lui-même. */
  private agitLan(x: ActionLan): void {
    if (this.spectateur) return;
    if (this.hote) this.hote.agit(x);
    else this.client?.agit(x);
  }

  /** Match en réseau figé (pause demandée par l'un des deux, ou compte à rebours de reprise). */
  private get pauseLan(): boolean {
    const e = this.partieLan;
    return !!this.jeuReseau && !!e && e.phase === 'match' && (e.pause !== null || this.repriseRestante() > 0);
  }

  private repriseRestante(): number {
    const e = this.partieLan;
    if (!e || e.pause !== null) return 0;
    if (this.hote) return e.reprise;
    return this.finReprise === null ? 0 : Math.max(0, this.finReprise - performance.now() / 1000);
  }

  /** Ferme toute session réseau en cours (annonce retirée, l'autre joueur est prévenu). */
  private fermeReseau(): void {
    this.lanGeneration++;
    this.hote?.ferme();
    this.hote = null;
    this.client?.ferme();
    this.client = null;
    this.jeuReseau = null;
    this.phaseVue = null;
    this.finReprise = null;
    this.reactions = [];
  }

  /** Écran de la liste des parties : détecte le réseau et écoute les annonces. */
  private ouvreLan(message: string | null = null): void {
    this.audio.init();
    this.fermeReseau();
    this.creeDemo();
    this.effets.reinitialise();
    this.ecranUI = 'lan';
    this.enPause = false;
    this.lanStatut = 'recherche';
    this.lanMessage = message;
    const gen = this.lanGeneration;
    SessionClient.cree().then(
      (c) => {
        if (gen !== this.lanGeneration) return c.ferme();
        this.client = c;
        this.lanStatut = 'pret';
        c.onCtrl = (m) => this.surCtrlClient(m);
        c.onJeu = (buf) => {
          const j = this.jeuReseau;
          const inst = j?.role === 'client' ? decodeInstantane(buf) : null;
          if (j?.role === 'client' && inst) {
            j.synchro.recoit(inst, performance.now() / 1000);
            this.ralenti.enregistre(inst);
          }
        };
        c.onFin = (raison) => this.ouvreLan(MESSAGES_FIN_CLIENT[raison]);
        c.onChange = () => {
          const e = c.partie;
          if (e) this.finReprise = e.reprise > 0 ? performance.now() / 1000 + e.reprise : null;
          this.suitPhaseLan();
        };
      },
      (e: unknown) => {
        if (gen !== this.lanGeneration) return;
        this.lanStatut = 'erreur';
        this.lanMessage = messageErreurReseau(e);
      },
    );
  }

  private quitteLan(): void {
    this.fermeReseau();
    this.retourMenu();
  }

  /** Bouton ACTUALISER : redemande les annonces (ou relance la détection après une erreur). */
  private actualiseLan(): void {
    if (this.lanStatut === 'connexion' || this.lanStatut === 'creation') return;
    if (!this.client) {
      this.ouvreLan();
      return;
    }
    this.lanMessage = null;
    this.client.actualise();
  }

  /** CRÉER UNE PARTIE : l'hôte règle d'abord le format du match. */
  private ouvreConfigLan(): void {
    this.fermeReseau();
    this.ecranUI = 'lanConfig';
  }

  private creePartieLan(): void {
    this.fermeReseau();
    this.ecranUI = 'lan';
    this.lanStatut = 'creation';
    this.lanMessage = null;
    const gen = this.lanGeneration;
    const config: ConfigLan = {
      effectif: this.pref.effectif,
      duree: this.pref.duree,
      assistTir: this.pref.assistTir,
      assistPasse: this.pref.assistPasse,
      changementAuto: this.pref.changementAuto,
      ralenti: this.pref.ralentiButs,
    };
    const equipeConnue = (id: string) => EQUIPES_JOUABLES.some((e) => e.id === id);
    SessionHote.cree({ nom: this.pref.pseudo, appareil: this.pref.appareil, equipe: this.pref.equipeJoueur, config }, equipeConnue).then(
      (h) => {
        if (gen !== this.lanGeneration) return h.ferme();
        this.hote = h;
        h.onChange = () => this.suitPhaseLan();
        h.onDebut = () => this.lanceMatchHote();
        h.onReaction = (r, de) => this.ajouteReaction(r, de);
        // un spectateur arrive en plein match : il le prend en route
        h.onSpectateur = (envoie) => {
          if (this.jeuReseau?.role === 'hote' && h.partie.phase === 'match') envoie({ t: 'debut', s0: this.seqInstantane + 1 });
        };
        h.onInviteParti = (raison, nom) => {
          this.salonMessage = {
            txt: raison === 'quitte' ? `${nom} A QUITTE LA PARTIE` : `CONNEXION PERDUE AVEC ${nom}`,
            jusqua: performance.now() / 1000 + 6,
          };
        };
        this.salonMessage = null;
        this.suitPhaseLan();
      },
      (e: unknown) => {
        if (gen !== this.lanGeneration) return;
        this.lanStatut = 'erreur';
        this.lanMessage = messageErreurReseau(e);
      },
    );
  }

  /** Rejoint une partie annoncée, comme joueur ou comme spectateur (`spect`). */
  private rejoinsLan(p: AnnoncePartie, spect = false): void {
    const c = this.client;
    if (!c || this.lanStatut !== 'pret') return;
    this.lanStatut = 'connexion';
    this.lanMessage = spect ? `CONNEXION AU MATCH DE ${p.nom}` : `CONNEXION A ${p.nom}`;
    const gen = this.lanGeneration;
    c.rejoins(p, this.pref.pseudo, this.pref.equipeJoueur, this.pref.appareil, spect).then(
      () => {
        if (gen !== this.lanGeneration) return;
        this.lanStatut = 'pret';
        this.lanMessage = null;
        this.suitPhaseLan();
      },
      (e: unknown) => {
        if (gen !== this.lanGeneration) return;
        this.lanStatut = 'pret';
        this.lanMessage = messageErreurReseau(e);
      },
    );
  }

  /**
   * Aligne l'écran sur la phase de la partie partagée : salle d'attente,
   * choix des équipes/maillots... Le match et la fin sont pilotés par la
   * simulation elle-même (message `debut`, phase `fin` de l'état de jeu).
   */
  private suitPhaseLan(): void {
    const e = this.partieLan;
    if (!e || e.phase === this.phaseVue) return;
    // tant que la connexion n'est pas finie, le client reste sur la liste
    if (this.client && !this.client.rejointe) return;
    this.phaseVue = e.phase;
    if (e.phase === 'attente' || e.phase === 'equipes' || e.phase === 'maillots') {
      if (this.jeuReseau) {
        this.jeuReseau = null;
        this.creeDemo();
        this.effets.reinitialise();
      }
      this.ecranUI = this.spectateur ? 'lanSpect' : e.phase === 'attente' ? 'salon' : 'lanChoix';
      this.enPause = false;
    } else if (e.phase === 'fin' && this.spectateur && !this.jeuReseau) {
      // arrivé entre deux matchs : on attend le prochain
      this.ecranUI = 'lanSpect';
    }
  }

  /** Flèches du choix d'équipe : ne change que sa propre équipe (retenue pour la prochaine fois). */
  private tourneEquipeLan(sens: 1 | -1): void {
    const e = this.partieLan;
    const moi = e?.joueurs[this.placeLan];
    if (!e || !moi || moi.pret) return;
    this.audio.clic();
    if (e.phase === 'maillots') {
      this.agitLan({ a: 'variante', variante: moi.variante === 'interieur' ? 'exterieur' : 'interieur' });
      return;
    }
    const n = EQUIPES_JOUABLES.length;
    const i = Math.max(0, EQUIPES_JOUABLES.findIndex((d) => d.id === moi.equipe));
    const id = EQUIPES_JOUABLES[(i + sens + n) % n]!.id;
    this.pref.equipeJoueur = id;
    sauvePreferences(this.pref);
    this.agitLan({ a: 'equipe', equipe: id });
  }

  private basculePretLan(): void {
    const moi = this.partieLan?.joueurs[this.placeLan];
    if (moi) this.agitLan({ a: 'pret', pret: !moi.pret });
  }

  /** Hôte : les deux joueurs ont validé, le match commence. */
  private lanceMatchHote(): void {
    const h = this.hote;
    if (!h) return;
    h.envoieCtrl({ t: 'debut', s0: this.seqInstantane + 1 });
    this.demarreMatchReseau(h.partie, { role: 'hote', eqLocal: 0, dernierEnvoi: 0 });
  }

  private demarreMatchReseau(e: EtatPartieLan, jeu: JeuReseau): void {
    const [j0, j1] = e.joueurs;
    if (!j1) return;
    this.audio.init();
    void demandePleinEcranPaysage();
    const eqs: [EquipeVisuelle, EquipeVisuelle] = [
      resoutEquipe(trouveTeamDef(j0.equipe), j0.variante),
      resoutEquipe(trouveTeamDef(j1.equipe), j1.variante),
    ];
    this.equipesActuelles = eqs;
    this.effets.definitEquipes(eqs);
    this.construitDecor();
    const c = e.config;
    const options: OptionsPartie = {
      mode: 'match',
      // coéquipiers CPU au même niveau des deux côtés : seul le talent des humains départage
      niveauIdx: 1,
      dureeIdx: Math.min(c.duree, DUREES.length - 1),
      effectifIdx: Math.min(c.effectif, EFFECTIFS.length - 1),
      equipeJoueur: trouveEquipe(eqs[0].teamId),
      equipeAdverse: trouveEquipe(eqs[1].teamId),
      assistTir: c.assistTir,
      assistPasse: c.assistPasse,
      changementAuto: c.changementAuto,
      humains: [true, true],
      bonus: [...e.bonus],
      dureeBut: dureeBut(c.ralenti),
    };
    this.demarreRalenti(options);
    this.state = creePartie(this.rink!, options);
    this.jeuReseau = jeu;
    this.phaseVue = 'match';
    this.finReprise = null;
    this.cumul = 0;
    this.effets.reinitialise();
    this.entrees.reinitialise();
    this.ecranUI = 'jeu';
    this.enPause = false;
    this.effets.annonce('PRETS ?', 'MATCH EN RESEAU', C.blanc, 1.5);
  }

  private surCtrlClient(m: MsgCtrl): void {
    if (m.t === 'debut') {
      const c = this.client;
      const e = c?.partie;
      if (c && e) this.demarreMatchReseau(e, { role: 'client', eqLocal: 1, synchro: new SynchroClient(m.s0), spectateur: c.spectateur });
    } else if (m.t === 'reaction') {
      this.ajouteReaction(m.r, m.de);
    } else if (m.t === 'ev') {
      if (this.jeuReseau?.role === 'client') this.jeuReseau.synchro.recoitEvenements(m.k, m.l);
    }
  }

  // ------------------------------------------------ réactions (mode spectateur)

  /** Une réaction reçue (ou émise ici, côté hôte) : elle monte le long du bord droit. */
  private ajouteReaction(r: string, de: string): void {
    const t = performance.now() / 1000;
    this.reactions = this.reactions.filter((a) => t - a.t0 < REACTION_VIE_S);
    const couloir = this.reactions.length ? (this.reactions[this.reactions.length - 1]!.couloir + 1) % 3 : 0;
    this.reactions.push({ r, de, t0: t, couloir });
    if (this.reactions.length > REACTIONS_MAX) this.reactions.shift();
  }

  /** Envoie une réaction (l'hôte la relaie à tous, y compris à cet écran). */
  private reagit(r: string): void {
    if (!estReaction(r)) return;
    if (this.hote) this.hote.reagit(r);
    else this.client?.reagit(r);
  }

  /** Barre de réactions : pour le spectateur en match et à la fin, pour les joueurs à la fin. */
  private barreReactionsVisible(): boolean {
    if (!this.jeuReseau) return false;
    if (this.spectateur) return this.ecranUI === 'jeu' || this.ecranUI === 'fin';
    return this.ecranUI === 'fin' && !this.imageFinSeule();
  }

  /** Écussons des deux équipes de la partie Wi-Fi (réactions « logo »). */
  private logosLan(): [string, string] {
    const e = this.partieLan;
    if (!e) return [this.equipesActuelles[0].teamId, this.equipesActuelles[1].teamId];
    return [e.joueurs[0].equipe, e.joueurs[1]?.equipe ?? e.joueurs[0].equipe];
  }

  /** Pause en réseau : elle vaut pour les deux joueurs (l'hôte fige la simulation). */
  private demandePauseLan(): void {
    if (!this.pauseLan) {
      this.entrees.reinitialise();
      this.agitLan({ a: 'pause', on: true });
    }
  }

  /** Image de victoire / défaite seule à l'écran (avant que les statistiques s'y superposent). */
  private imageFinSeule(): boolean {
    const f = this.imageFin;
    if (!f || f.stats) return false;
    if (performance.now() / 1000 - f.t0 > IMAGE_FIN_S) f.stats = true;
    return !f.stats;
  }

  /**
   * Image de fin de match plein écran (recadrée pour couvrir l'écran) : seule
   * pendant `IMAGE_FIN_S` secondes (ou jusqu'à un appui), puis en fond derrière
   * les statistiques. Renvoie false s'il n'y a pas d'image à montrer.
   */
  private dessineImageFin(g: CanvasRenderingContext2D): boolean {
    const f = this.imageFin;
    if (!f) return false;
    const t = performance.now() / 1000 - f.t0;
    const brute = f.gagne ? this.imagesFin.victoire : this.imagesFin.defaite;
    if (!brute.complete || brute.naturalWidth === 0) return false;
    // aux couleurs de l'équipe du joueur (l'image d'origine tant que ce n'est pas prêt)
    const img: CanvasImageSource = this.imageFinEquipe(f.gagne) ?? brute;
    g.fillStyle = '#05060d';
    g.fillRect(0, 0, this.W, this.H);
    const k = Math.max(this.W / brute.naturalWidth, this.H / brute.naturalHeight);
    const w = brute.naturalWidth * k;
    const h = brute.naturalHeight * k;
    g.save();
    g.globalAlpha = Math.min(1, t / 0.15);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // calé en bas : on garde les joueurs, quitte à couper les banderoles du haut
    g.drawImage(img, (this.W - w) / 2, this.H - h, w, h);
    g.restore();
    return true;
  }

  /** Image de victoire / défaite repeinte aux couleurs de l'équipe de ce joueur (mise en cache). */
  private imageFinEquipe(gagne: boolean): HTMLCanvasElement | null {
    const nom = gagne ? 'victoire' : 'defaite';
    const eq = this.equipesActuelles[this.eqLocal];
    const cle = `${nom}:${eq.id}`;
    if (this.imageFinRepeinte?.cle === cle) return this.imageFinRepeinte.c;
    const c = repeintImageFin(nom, this.imagesFin[nom], this.rolesFin[nom], eq);
    if (c) this.imageFinRepeinte = { cle, c };
    return c;
  }

  /** Match terminé (détecté dans l'état de jeu) : écran de fin, et vote côté hôte. */
  private surFinMatch(): void {
    this.ecranUI = 'fin';
    this.enPause = false;
    this.entrees.reinitialise();
    // victoire ou défaite, vue de ce joueur-ci (en Wi-Fi, chacun voit la sienne)
    this.imageFin = null;
    const sc = this.state?.score;
    if (sc && sc[0] !== sc[1] && !this.spectateur) {
      const moi = this.eqLocal;
      this.imageFin = { gagne: sc[moi] > sc[moi === 0 ? 1 : 0], t0: performance.now() / 1000, stats: false };
    }
    if (!this.jeuReseau && sc && this.state) this.noteMatchCoupe(this.state);
    if (this.jeuReseau?.role === 'hote') this.hote?.finMatch();
    if (this.jeuReseau) this.phaseVue = 'fin';
    // bilan des duels Wi-Fi, gardé sur chaque appareil
    const e = this.partieLan;
    const s = this.state;
    const adv = e?.joueurs[this.placeLan === 0 ? 1 : 0];
    if (this.jeuReseau && adv && s && !this.spectateur) {
      const moi = this.eqLocal;
      const eux = moi === 0 ? 1 : 0;
      noteDuel(this.pref, adv.appareil, adv.nom, s.score[moi] > s.score[eux] ? 'v' : s.score[moi] < s.score[eux] ? 'd' : 'n');
    }
  }

  // ------------------------------------------------ ralenti des buts

  private demarreRalenti(options: OptionsPartie): void {
    this.optionsMatch = options;
    this.etatRalenti = null;
    this.phaseHote = null;
    this.ralenti.reinitialise();
  }

  /** À chaque image de match : enregistre (hôte/solo), fait avancer la lecture et prépare l'image du ralenti. */
  private majRalenti(state: MatchState, dt: number, enregistre: boolean): void {
    if (state.mode !== 'match' || !this.rink) return;
    if (enregistre) {
      const inst = decodeInstantane(encodeInstantane(state, this.rink, 0));
      if (inst) this.ralenti.enregistre(inst);
    }
    this.ralenti.maj(state, dt, this.pauseLan || this.enPause);
    if (this.ralenti.actif && this.optionsMatch) {
      this.etatRalenti ??= creePartie(this.rink, this.optionsMatch);
      this.ralenti.applique(this.etatRalenti, this.rink);
    }
  }

  /** PASSER : en solo tout de suite ; en Wi-Fi, le jeu reprend quand les deux ont passé. */
  private passeRalenti(): void {
    if (!this.ralenti.actif) return;
    if (this.jeuReseau) {
      this.agitLan({ a: 'passer' });
      return;
    }
    this.ralenti.arrete();
    if (this.state?.phase === 'but') this.state.phaseT = Math.min(this.state.phaseT, 0.4);
  }

  /** Hôte : nouveau but → votes « passer » remis à zéro ; les deux ont passé → remise en jeu. */
  private arbitreRalentiHote(state: MatchState): void {
    const h = this.hote;
    if (!h) return;
    if (state.phase === 'but' && this.phaseHote !== 'but') h.debutRalenti();
    this.phaseHote = state.phase;
    const [a, b] = h.partie.ralentiPasse;
    if (state.phase === 'but' && a && b) state.phaseT = Math.min(state.phaseT, 0.4);
  }

  /** Client : envoie ses entrées, puis affiche l'état interpolé reçu de l'hôte. */
  private boucleClient(synchro: SynchroClient, dt: number): void {
    const state = this.state;
    const rink = this.rink;
    const c = this.client;
    if (!state || !rink || !c) return;
    const maintenant = performance.now() / 1000;
    let intent = this.ecranUI === 'jeu' && !this.pauseLan && !this.spectateur ? this.entrees.consomme() : INTENT_VIDE;
    const r = synchro.rinkHote;
    if (r) {
      const kx = r.w / rink.w;
      const ky = r.h / rink.h;
      const [ix, iy] = directionVersHote(intent.ix, intent.iy, kx, ky);
      const visee = intent.viseeManuelle === null ? null : angleVersHote(intent.viseeManuelle, kx, ky);
      intent = { ...intent, ix, iy, viseeManuelle: visee };
    }
    c.envoieEntree(intent);
    const evs = synchro.avance(state, rink, dt, maintenant);
    if (evs.length) {
      joueEvenements(this.audio, evs);
      this.effets.traite(evs);
    }
    this.effets.maj(dt);
    this.majRalenti(state, dt, false);
    if (state.phase === 'fin' && this.ecranUI === 'jeu') this.surFinMatch();
  }

  /** Latence Wi-Fi en coin d'écran, et alerte si l'hôte ne donne plus signe de vie. */
  private dessineEtatReseau(g: CanvasRenderingContext2D, temps: number): void {
    const j = this.jeuReseau;
    const ms = (j?.role === 'hote' ? this.hote?.latenceMs : this.client?.latenceMs) ?? null;
    if (ms !== null) texte(g, `WIFI ${Math.max(1, Math.round(ms))} MS`, 4, 4, ms < 60 ? '#6f7aa6' : '#ff9a5c', 1, 'g');
    // spectateurs connectés (et, chez eux, le rappel qu'ils regardent seulement)
    const nb = this.partieLan?.spect ?? 0;
    if (this.spectateur) texte(g, 'SPECTATEUR', 4, 13, '#8fe3ff', 1, 'g');
    else if (nb > 0) texte(g, `${nb} SPECT.`, 4, 13, '#6f7aa6', 1, 'g');
    if (j?.role === 'client' && !this.pauseLan && j.synchro.silence(performance.now() / 1000) > 1) {
      const cy = Math.round(this.H / 2);
      g.fillStyle = 'rgba(7,9,20,0.6)';
      g.fillRect(0, cy - 12, this.W, 22);
      g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 3));
      texte(g, "EN ATTENTE DE L'HOTE...", Math.round(this.W / 2), cy - 4, C.or, 1, 'c');
      g.globalAlpha = 1;
    }
  }

  private carteDe(id: string): CarteEquipe {
    const def = trouveTeamDef(id);
    return { def, profil: trouveEquipe(def.id) };
  }

  private lanProps(): EtatLan {
    return {
      statut: this.lanStatut,
      message: this.lanMessage,
      parties: (this.client?.parties ?? []).map((p) => ({
        nom: p.nom,
        equipe: trouveTeamDef(p.equipe),
        effectifIdx: p.effectif,
        dureeIdx: p.duree,
        plein: p.plein,
        adverse: p.adverse ? trouveTeamDef(p.adverse) : null,
        score: p.score,
        spect: p.spect,
        onRejoindre: () => this.rejoinsLan(p),
        onRegarder: () => this.rejoinsLan(p, true),
      })),
      pseudo: this.pref.pseudo,
      onRetour: () => this.quitteLan(),
      onActualiser: () => this.actualiseLan(),
      onCreer: () => this.ouvreConfigLan(),
    };
  }

  private configLanProps(): EtatConfigLan {
    const bascule = (cle: 'assistTir' | 'assistPasse' | 'changementAuto' | 'ralentiButs') => () => {
      this.pref[cle] = !this.pref[cle];
      sauvePreferences(this.pref);
    };
    return {
      effectifIdx: this.pref.effectif,
      dureeIdx: this.pref.duree,
      assistTir: this.pref.assistTir,
      assistPasse: this.pref.assistPasse,
      changementAuto: this.pref.changementAuto,
      ralenti: this.pref.ralentiButs,
      onEffectif: () => {
        this.pref.effectif = (this.pref.effectif + 1) % EFFECTIFS.length;
        sauvePreferences(this.pref);
      },
      onDuree: () => {
        this.pref.duree = (this.pref.duree + 1) % DUREES.length;
        sauvePreferences(this.pref);
      },
      onAssistTir: bascule('assistTir'),
      onAssistPasse: bascule('assistPasse'),
      onChangementAuto: bascule('changementAuto'),
      onRalenti: bascule('ralentiButs'),
      onRetour: () => this.ouvreLan(),
      onCreer: () => this.creePartieLan(),
    };
  }

  private resumeConfig(c: ConfigLan): ResumeConfig {
    return {
      effectifIdx: c.effectif,
      dureeIdx: c.duree,
      assistTir: c.assistTir,
      assistPasse: c.assistPasse,
      changementAuto: c.changementAuto,
      ralenti: c.ralenti,
    };
  }

  /** « VOS DUELS : 5 V - 3 D » contre cet adversaire, ou null si vous ne vous êtes jamais affrontés. */
  private bilanContre(e: EtatPartieLan): string | null {
    const adv = e.joueurs[this.placeLan === 0 ? 1 : 0];
    const b = adv ? this.pref.duels[adv.appareil] : undefined;
    if (!b) return null;
    return `VOS DUELS : ${b.v} V - ${b.d} D${b.n ? ` - ${b.n} N` : ''}`;
  }

  private salonProps(e: EtatPartieLan): EtatSalon {
    const maintenant = performance.now() / 1000;
    const message = this.salonMessage && this.salonMessage.jusqua > maintenant ? this.salonMessage.txt : null;
    const session = this.hote ?? this.client;
    return {
      role: this.hote ? 'hote' : 'client',
      hote: e.joueurs[0].nom,
      invite: e.joueurs[1]?.nom ?? null,
      connexionEnCours: this.hote?.connexionEnCours ?? false,
      config: this.resumeConfig(e.config),
      code: session?.code ?? null,
      latenceMs: session?.latenceMs ?? null,
      message,
      bonus: e.bonus,
      bilan: this.bilanContre(e),
      onBonus: (place) => {
        const i = BONUS_EQUIPE.indexOf(e.bonus[place]);
        this.agitLan({ a: 'bonus', place, bonus: BONUS_EQUIPE[(i + 1) % BONUS_EQUIPE.length]! });
      },
      onLancer: () => this.agitLan({ a: 'lancer' }),
      onExclure: () => this.hote?.exclut(),
      onQuitter: () => this.ouvreLan(),
    };
  }

  private choixLanProps(e: EtatPartieLan): EtatChoixLan | null {
    const [a, b] = e.joueurs;
    if (!b || (e.phase !== 'equipes' && e.phase !== 'maillots')) return null;
    const moi = this.placeLan;
    const cote = (j: JoueurLan): CoteChoixLan => ({ nom: j.nom, pret: j.pret, carte: this.carteDe(j.equipe), variante: j.variante });
    const autre = moi === 0 ? b : a;
    return {
      etape: e.phase,
      moi,
      cotes: [cote(a), cote(b)],
      maillotPris: e.phase === 'maillots' && autre.pret && maillotsIdentiques(e),
      onPrecedent: () => this.tourneEquipeLan(-1),
      onSuivant: () => this.tourneEquipeLan(1),
      onToggleMaillot: () => this.tourneEquipeLan(1),
      onPret: (pret) => this.agitLan({ a: 'pret', pret }),
      onQuitter: () => this.ouvreLan(),
    };
  }

  private finLanProps(state: MatchState, e: EtatPartieLan): EtatFinLan {
    const moi = this.placeLan;
    const eux = moi === 0 ? 1 : 0;
    return {
      score: state.score,
      tirs: state.tirs,
      stats: state.stats,
      bilan: this.bilanContre(e),
      prolong: state.prolong,
      moi,
      monVote: e.joueurs[moi]?.vote ?? null,
      voteAdverse: e.joueurs[eux]?.vote ?? null,
      nomAdverse: e.joueurs[eux]?.nom ?? '',
      onVote: (vote) => this.agitLan({ a: 'vote', vote }),
      onQuitter: () => this.ouvreLan(),
    };
  }

  private pause(oui: boolean): void {
    if (this.jeuReseau) {
      if (oui) this.demandePauseLan();
      return;
    }
    if (this.ecranUI !== 'jeu' && this.ecranUI !== 'pause') return;
    this.enPause = oui;
    this.ecranUI = oui ? 'pause' : 'jeu';
    this.entrees.reinitialise();
  }

  private persisteFinMatch(gagne: boolean): void {
    const n = this.niveauMatch;
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
        // souris : le pointerdown suffit comme geste ; doigt : voir pointerup
        if (e.pointerType === 'mouse') this.pleinEcran.tente();
        const p = this.versLogique(e);
        if (this.portrait) return;
        if (this.ecranUI === 'jeu' && this.ralenti.actif && !this.pauseLan) {
          const b = clicSurBouton(this.boutons, p.x, p.y);
          if (b) {
            this.audio.clic();
            b.act();
            return;
          }
        }
        if (this.ecranUI === 'jeu' && this.spectateur) {
          // le spectateur ne pilote rien : ses appuis vont aux réactions (ou au bouton QUITTER de la pause)
          const b = clicSurBouton(this.boutons, p.x, p.y);
          if (b) b.act();
          return;
        }
        if (this.ecranUI === 'jeu' && !this.enPause && !this.pauseLan) {
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
        if (this.ecranUI === 'fin' && this.imageFinSeule()) {
          this.imageFin!.stats = true;
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
    this.ecran.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') this.pleinEcran.tente();
      relache(e);
    });
    this.ecran.addEventListener('pointercancel', relache);
    this.ecran.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.audio.init();
      if (e.code !== 'Escape') this.pleinEcran.tente();
      this.entrees.onKeyDown(e);
      if (this.entrees.pauseDemandee) {
        this.entrees.pauseDemandee = false;
        if (this.ecranUI === 'jeu') this.pause(true);
      }
      if (e.code === 'Enter') {
        if (this.ecranUI === 'fin' && this.imageFinSeule()) this.imageFin!.stats = true;
        else if (this.ecranUI === 'menu') this.jouer();
        else if (this.ecranUI === 'coupeChoix') this.lanceCoupe();
        else if (this.ecranUI === 'coupe') this.entreeTableau();
        else if (this.ecranUI === 'lan') this.actualiseLan();
        else if (this.ecranUI === 'lanConfig') this.creePartieLan();
        else if (this.ecranUI === 'salon') this.agitLan({ a: 'lancer' });
        else if (this.ecranUI === 'lanChoix') this.basculePretLan();
        else if (this.ecranUI === 'fin' && this.jeuReseau) this.agitLan({ a: 'vote', vote: 'rejouer' });
        else if (this.ecranUI === 'jeu' && this.pauseLan) this.agitLan({ a: 'pause', on: false });
        else if (this.ecranUI === 'jeu' && this.ralenti.actif) this.passeRalenti();
        else if (this.ecranUI === 'equipes') this.confirmeSelection();
        else if (this.ecranUI === 'maillots') this.confirmeMaillots();
        else if (this.ecranUI === 'fin' && this.matchCoupe) this.ouvreTableau();
        else if (this.ecranUI === 'fin') this.rejoue();
        else if (this.ecranUI === 'avance') this.fermeAvance();
        else if (this.enPause) this.pause(false);
      }
      // réactions au clavier : touches 1 à 6
      const chiffre = /^(Digit|Numpad)([1-6])$/.exec(e.code);
      if (chiffre && !e.repeat && this.barreReactionsVisible()) this.reagit(CODES_REACTIONS[Number(chiffre[2]) - 1]!);
      if (e.code === 'Escape' && this.ecranUI === 'lanSpect') this.ouvreLan();
      if (e.code === 'Escape' && this.ecranUI === 'maillots') this.retourChoixEquipes();
      if (e.code === 'Escape' && this.ecranUI === 'coupeChoix') this.retourMenu();
      if (e.code === 'Escape' && this.ecranUI === 'coupe') this.quitteTableau();
      if (this.ecranUI === 'coupeChoix' && !e.repeat) {
        if (e.code === 'ArrowLeft') this.tourneJoueur(-1);
        else if (e.code === 'ArrowRight') this.tourneJoueur(1);
        else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') this.toggleVarianteJoueur();
      }
      if (e.code === 'Escape' && this.ecranUI === 'avance') this.fermeAvance();
      if (e.code === 'Escape' && this.ecranUI === 'lan') this.quitteLan();
      else if (e.code === 'Escape' && (this.ecranUI === 'salon' || this.ecranUI === 'lanConfig')) this.ouvreLan();
      if (this.ecranUI === 'lanChoix' && !e.repeat) {
        if (e.code === 'ArrowLeft') this.tourneEquipeLan(-1);
        else if (e.code === 'ArrowRight') this.tourneEquipeLan(1);
      }
      if (this.ecranUI === 'equipes' && !e.repeat) {
        // pensé « manette » : gauche/droite pour votre équipe, haut/bas pour l'adversaire
        if (e.code === 'ArrowLeft') this.tourneJoueur(-1);
        else if (e.code === 'ArrowRight') this.tourneJoueur(1);
        else if (e.code === 'ArrowUp') this.tourneAdversaire(-1);
        else if (e.code === 'ArrowDown') this.tourneAdversaire(1);
      }
      if (this.ecranUI === 'maillots' && !e.repeat) {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') this.toggleVarianteJoueur();
        else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') this.toggleVarianteAdversaire();
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.entrees.onKeyUp(e));

    window.addEventListener('resize', () => this.dispose());
    window.addEventListener('orientationchange', () => setTimeout(() => this.dispose(), 120));
    document.addEventListener('visibilitychange', () => {
      // téléphone verrouillé ou appli en arrière-plan : pause (partagée en réseau)
      if (document.hidden && this.ecranUI === 'jeu') this.pause(true);
    });
    // onglet fermé : on retire l'annonce et on prévient l'autre joueur tout de suite
    window.addEventListener('pagehide', () => this.fermeReseau());
  }

  // ------------------------------------------------------------------ boucle

  private boucle(t: number): void {
    const dt = Math.min(0.05, (t - this.dernier) / 1000);
    this.dernier = t;
    const state = this.state;
    const reseau = this.jeuReseau;
    if (reseau?.role === 'client') {
      this.boucleClient(reseau.synchro, dt);
    } else if ((!this.portrait || reseau) && (!this.enPause || reseau) && state && this.rink) {
      // en réseau, l'hôte ne met jamais la simulation en pause : l'autre joueur continue
      const hote = reseau ? this.hote : null;
      const maintenant = performance.now() / 1000;
      const entree = (eq: TeamId): InputIntent =>
        eq === 0 ? this.entrees.consomme() : hote ? hote.entreeInvite(maintenant) : INTENT_VIDE;
      if (hote) {
        hote.avance(dt);
        hote.majScore(state.score);
      }
      // pause partagée : la simulation est figée pour les deux joueurs
      this.cumul = this.pauseLan ? 0 : this.cumul + dt;
      while (this.cumul >= PAS_FIXE) {
        pas(this.rink, state, PAS_FIXE, entree);
        this.cumul -= PAS_FIXE;
      }
      if (state.evenements.length) {
        hote?.envoieCtrl({ t: 'ev', k: state.temps, l: evenementsPourEnvoi(state.evenements) });
        joueEvenements(this.audio, state.evenements);
        this.effets.traite(state.evenements);
        state.evenements.length = 0;
      }
      // ~60 instantanés/s en jeu ; 4/s suffisent pendant une pause (rien ne bouge)
      if (hote && reseau?.role === 'hote' && t - reseau.dernierEnvoi >= (this.pauseLan ? 250 : 12)) {
        hote.envoieJeu(encodeInstantane(state, this.rink, ++this.seqInstantane));
        reseau.dernierEnvoi = t;
      }
      this.effets.maj(dt);
      if (reseau?.role === 'hote') this.arbitreRalentiHote(state);
      this.majRalenti(state, dt, state.dureeBut > DUREE_BUT);
      if (state.phase === 'fin' && state.mode === 'match' && this.ecranUI !== 'fin') {
        this.surFinMatch();
        if (!reseau) this.persisteFinMatch(state.score[0] > state.score[1]);
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
        this.spectateur ? null : this.eqLocal,
      );
      g.setTransform(E, 0, 0, E, 0, 0);
      // empilement lors d'un but : patinoire, écusson géant, puis tableau et bandeau
      if (!ECRANS_MENU.includes(this.ecranUI)) {
        if (!ralenti) dessineLogoBut(g, this.W, this.H, this.rink, this.effets.banniere, this.ecranUI, tempsUI);
        dessineTableau(g, this.W, state, this.ecranUI, this.equipesActuelles);
      }
      if (!ralenti && (this.ecranUI === 'menu' || !ECRANS_MENU.includes(this.ecranUI))) {
        dessineBanniere(g, this.W, this.rink, this.effets.banniere, this.ecranUI);
      }
      // le buteur qui fête son but passe au premier plan, devant l'écusson et le bandeau
      if (!ralenti && !ECRANS_MENU.includes(this.ecranUI)) {
        dessineCelebration(g, this.W, this.H, this.sprites, this.effets.banniere, this.ecranUI);
      }
      if (this.jeuReseau && !ECRANS_MENU.includes(this.ecranUI)) this.dessineEtatReseau(g, tempsUI);
      const partie = this.partieLan;
      if (this.ecranUI === 'jeu' && partie && this.jeuReseau && partie.pause !== null) {
        dessinePauseLan(g, this.boutons, this.W, this.H, {
          par: partie.joueurs[partie.pause]?.nom ?? '',
          onReprendre: this.spectateur ? undefined : () => this.agitLan({ a: 'pause', on: false }),
          onQuitter: () => this.ouvreLan(),
        });
      } else if (this.ecranUI === 'jeu' && this.pauseLan) {
        dessineRepriseLan(g, this.W, this.H, this.repriseRestante());
      } else if (ralenti) {
        const enLan = !!partie && !!this.jeuReseau;
        const passe = enLan && partie!.ralentiPasse[this.placeLan];
        const autre = partie?.joueurs[this.placeLan === 0 ? 1 : 0];
        dessineRalenti(g, this.boutons, this.W, this.H, tempsUI, {
          progression: this.ralenti.progression,
          // le spectateur ne passe pas le ralenti : les joueurs décident
          attente: this.spectateur ? 'RALENTI DU BUT' : passe ? `EN ATTENTE DE ${autre?.nom ?? ''}` : null,
          onPasser: () => this.passeRalenti(),
        });
      } else if (this.ecranUI === 'jeu' && this.spectateur) {
        // pas de commandes : la barre de réactions est dessinée plus bas
      } else if (this.ecranUI === 'jeu') {
        const pilote = state.controles[this.eqLocal];
        dessineCommandes(g, this.W, this.H, state.temps, pilote, this.entrees.instantaneUI(), !!pilote && menaceEchec(state, pilote) !== null);
        if (pilote?.arme) dessineJaugeTir(g, this.H, pilote.charge, state.temps);
      } else if (this.ecranUI === 'lan') {
        dessineLan(g, this.boutons, this.W, this.H, tempsUI, this.lanProps());
      } else if (this.ecranUI === 'lanConfig') {
        dessineConfigLan(g, this.boutons, this.W, this.H, this.configLanProps());
      } else if (this.ecranUI === 'lanSpect' && partie) {
        dessineAttenteSpectateur(g, this.boutons, this.W, this.H, tempsUI, {
          joueurs: [partie.joueurs[0].nom, partie.joueurs[1]?.nom ?? null],
          sous:
            partie.phase === 'attente'
              ? 'LES JOUEURS SE PREPARENT'
              : partie.phase === 'fin'
                ? 'LES JOUEURS VOTENT POUR LA SUITE'
                : 'LES JOUEURS CHOISISSENT LEURS EQUIPES',
          spect: partie.spect,
          onQuitter: () => this.ouvreLan(),
        });
      } else if (this.ecranUI === 'salon' && partie) {
        dessineSalon(g, this.boutons, this.W, this.H, tempsUI, this.salonProps(partie));
      } else if (this.ecranUI === 'lanChoix' && partie) {
        const props = this.choixLanProps(partie);
        if (props) dessineChoixLan(g, this.boutons, this.sprites, this.W, this.H, tempsUI, props);
      } else if (this.ecranUI === 'fin' && this.dessineImageFin(g) && this.imageFinSeule()) {
        // image de victoire / défaite seule, avant que les statistiques s'y superposent
      } else if (this.ecranUI === 'fin' && partie && this.jeuReseau && this.spectateur) {
        dessineFinSpectateur(g, this.boutons, this.W, this.H, tempsUI, {
          score: state.score,
          tirs: state.tirs,
          stats: state.stats,
          prolong: state.prolong,
          noms: [partie.joueurs[0].nom, partie.joueurs[1]?.nom ?? ''],
          onQuitter: () => this.ouvreLan(),
        });
      } else if (this.ecranUI === 'fin' && partie && this.jeuReseau) {
        dessineFinLan(g, this.boutons, this.W, this.H, tempsUI, this.finLanProps(state, partie));
      } else if (this.ecranUI === 'menu') {
        dessineMenu(g, this.boutons, this.W, this.H, tempsUI, this.menuProps());
      } else if (this.ecranUI === 'avance') {
        dessineAvance(g, this.boutons, this.W, this.H, this.avanceProps());
      } else if (this.ecranUI === 'equipes') {
        dessineSelectionEquipe(g, this.boutons, this.W, this.H, this.selectionProps());
      } else if (this.ecranUI === 'maillots') {
        dessineChoixMaillots(g, this.boutons, this.sprites, this.W, this.H, this.maillotsProps());
      } else if (this.ecranUI === 'coupeChoix') {
        dessineChoixCoupe(g, this.boutons, this.sprites, this.W, this.H, this.choixCoupeProps());
      } else if (this.ecranUI === 'coupe' && this.pref.coupe) {
        dessineTableauCoupe(g, this.boutons, this.W, this.H, performance.now() / 1000, this.tableauProps());
        // un petit bruit à chaque résultat dévoilé
        const r = this.revelation;
        const n = r ? etapesVues(r, performance.now() / 1000) : 0;
        if (n > this.etapesSonnees) {
          if (n - this.etapesSonnees === 1) this.audio.clic();
          this.etapesSonnees = n;
        }
      } else if (this.ecranUI === 'pause') {
        dessinePause(g, this.boutons, this.W, this.H, () => this.pause(false), () => (this.matchCoupe ? this.ouvreTableau() : this.retourMenu()));
      } else if (this.ecranUI === 'fin') {
        dessineFin(g, this.boutons, this.W, this.H, tempsUI, this.finProps(state));
      }
      // mode spectateur : barre de réactions, puis les réactions qui montent (sur tous les écrans)
      if (this.barreReactionsVisible()) {
        dessineBarreReactions(g, this.boutons, Math.round(this.W / 2), this.H - 13, this.logosLan(), (r) => this.reagit(r), 10);
      }
      if (this.reactions.length && (this.jeuReseau || this.ecranUI === 'lanSpect')) {
        dessineReactions(g, this.W, this.H, this.reactions, tempsUI, this.logosLan());
      }
      if (this.effets.flash > 0) {
        g.fillStyle = `rgba(255,255,255,${this.effets.flash * 0.5})`;
        g.fillRect(0, 0, this.W, this.H);
      }
    }
  }

  private menuProps(): EtatMenu {
    const c = this.pref.coupe;
    return {
      coupe: this.pref.mode === 'coupe',
      tourCoupe: c && !coupeTerminee(c) ? NOMS_TOURS[c.tour]! : null,
      onMode: () => {
        this.pref.mode = this.pref.mode === 'coupe' ? 'classique' : 'coupe';
        sauvePreferences(this.pref);
      },
      niveauIdx: this.pref.niveau,
      dureeIdx: this.pref.duree,
      effectifIdx: this.pref.effectif,
      son: this.pref.son,
      victoires: this.pref.victoires[this.pref.niveau] ?? 0,
      matchs: this.pref.matchs[this.pref.niveau] ?? 0,
      tactile: this.entrees.tactile,
      version: __VERSION_APP__,
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
      onJouer: () => this.jouer(),
      onReseau: () => this.ouvreLan(),
      onAvance: () => this.ouvreAvance(),
    };
  }

  private jouer(): void {
    if (this.pref.mode === 'coupe') this.ouvreCoupe();
    else this.ouvreSelectionEquipe();
  }

  /** Entrée sur le tableau : passe le dévoilement, sinon joue le match du tour (ou relance une coupe). */
  private entreeTableau(): void {
    const r = this.revelation;
    const c = this.pref.coupe;
    if (r && r.t0 !== null && etapesVues(r, performance.now() / 1000) < r.etapes.length) this.passeRevelation();
    else if (c && coupeTerminee(c)) this.nouvelleCoupe();
    else this.joueMatchCoupe();
  }

  private choixCoupeProps() {
    const def = EQUIPES_JOUABLES[this.indexSelectionJoueur]!;
    return {
      carte: this.carte(this.indexSelectionJoueur),
      maillot: { def, variante: this.varianteJoueur },
      onPrecedent: () => this.tourneJoueur(-1),
      onSuivant: () => this.tourneJoueur(1),
      onMaillot: () => this.toggleVarianteJoueur(),
      onRetour: () => this.retourMenu(),
      onLancer: () => this.lanceCoupe(),
    };
  }

  private tableauProps() {
    return {
      coupe: this.pref.coupe!,
      revelation: this.revelation,
      confirmeAbandon: performance.now() / 1000 < this.confirmeAbandonJusqua,
      onJouer: () => this.joueMatchCoupe(),
      onAbandonner: () => this.abandonneCoupe(),
      onNouvelle: () => this.nouvelleCoupe(),
      onMenu: () => this.quitteTableau(),
      onPasser: () => this.passeRevelation(),
    };
  }

  private avanceProps(): EtatAvance {
    return {
      assistTir: this.pref.assistTir,
      assistPasse: this.pref.assistPasse,
      changementAuto: this.pref.changementAuto,
      secoussesReduites: this.pref.secoussesReduites,
      ralentiButs: this.pref.ralentiButs,
      onRalenti: () => {
        this.pref.ralentiButs = !this.pref.ralentiButs;
        sauvePreferences(this.pref);
      },
      onAssistTir: () => {
        this.pref.assistTir = !this.pref.assistTir;
        sauvePreferences(this.pref);
      },
      onAssistPasse: () => {
        this.pref.assistPasse = !this.pref.assistPasse;
        sauvePreferences(this.pref);
      },
      onChangementAuto: () => {
        this.pref.changementAuto = !this.pref.changementAuto;
        sauvePreferences(this.pref);
      },
      onSecousses: () => {
        this.pref.secoussesReduites = !this.pref.secoussesReduites;
        this.effets.intensiteEcran = this.pref.secoussesReduites ? 0.4 : 1;
        sauvePreferences(this.pref);
      },
      onRetour: () => this.fermeAvance(),
    };
  }

  private carte(index: number): CarteEquipe {
    const def = EQUIPES_JOUABLES[index]!;
    return { def, profil: trouveEquipe(def.id) };
  }

  private selectionProps(): EtatSelectionEquipe {
    return {
      joueur: this.carte(this.indexSelectionJoueur),
      adversaire: this.carte(this.indexSelectionAdversaire),
      onPrecedentJoueur: () => this.tourneJoueur(-1),
      onSuivantJoueur: () => this.tourneJoueur(1),
      onPrecedentAdversaire: () => this.tourneAdversaire(-1),
      onSuivantAdversaire: () => this.tourneAdversaire(1),
      onConfirmer: () => this.confirmeSelection(),
    };
  }

  private maillotsProps(): EtatChoixMaillots {
    const cote = (index: number, variante: Variante): CoteMaillot => ({ def: EQUIPES_JOUABLES[index]!, variante });
    return {
      joueur: cote(this.indexSelectionJoueur, this.varianteJoueur),
      adversaire: cote(this.indexSelectionAdversaire, this.varianteAdversaire),
      onToggleJoueur: () => this.toggleVarianteJoueur(),
      onToggleAdversaire: () => this.toggleVarianteAdversaire(),
      onRetour: () => this.retourChoixEquipes(),
      onConfirmer: () => this.confirmeMaillots(),
    };
  }

  private finProps(state: MatchState): EtatFin {
    return {
      score: state.score,
      tirs: state.tirs,
      stats: state.stats,
      prolong: state.prolong,
      niveauNom: NIVEAUX[this.niveauMatch]!.nom,
      victoires: this.pref.victoires[this.niveauMatch] ?? 0,
      matchs: this.pref.matchs[this.niveauMatch] ?? 0,
      equipes: this.equipesActuelles,
      onRejouer: () => (this.matchCoupe ? this.ouvreTableau() : this.rejoue()),
      onMenu: () => this.retourMenu(),
      libelleRejouer: this.matchCoupe ? 'TABLEAU >' : undefined,
      pied: this.matchCoupe ? `COUPE FACE-OFF  -  NIVEAU ${NIVEAUX[this.niveauMatch]!.nom}` : undefined,
    };
  }
}
