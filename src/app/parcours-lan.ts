import { type MatchState, type Skater, type TeamId } from '@core/types';
import type { AnnoncePartie } from '@net/annuaire';
import { CANAL_LOCAL, type Canal } from '@net/canal';
import {
  campDe,
  estReaction,
  hoteChoisit,
  patineurPilote,
  SPECTATEURS_MAX,
  type ActionLan,
  type Camp,
  type ConfigLan,
  type EtatPartieLan,
  type PhaseLan,
  type Siege,
} from '@net/partie';
import { decodeInstantane } from '@net/instantane';
import { type MsgCtrl } from '@net/protocole';
import { SessionClient } from '@net/session-client';
import type { RaisonFin } from '@net/session-commun';
import { SessionHote } from '@net/session-hote';
import {
  CODES_REACTIONS,
  EQUIPES_JOUABLES,
  REACTION_VIE_S,
  REACTIONS_MAX,
  type ReactionAffichee,
  type StatutLan,
} from '@render/index';
import type { EcranUI } from './ecrans';
import type { GameApp } from './game-app';
import { sauvePreferences } from './preferences';
import { MatchLan, type JeuReseau } from './match-lan';
import { ParcoursLigne } from './parcours-ligne';
import { VuesLan } from './vues-lan';

function messageErreurReseau(e: unknown, enLigne = false): string {
  const m = e instanceof Error ? e.message : '';
  if (m === 'reseau') return enLigne ? 'INTERNET INTROUVABLE' : 'WIFI NON DETECTE - VERIFIEZ LA CONNEXION';
  if (m.startsWith('aucun serveur')) return 'DECOUVERTE INDISPONIBLE - REESSAYEZ';
  if (m === 'complet') return 'CETTE PARTIE EST DEJA COMPLETE';
  if (m === 'spectateurs') return `DEJA ${SPECTATEURS_MAX} SPECTATEURS SUR CETTE PARTIE`;
  if (m === 'version') return 'VERSIONS DIFFERENTES : METTEZ LE JEU A JOUR';
  if (m === 'injoignable') return "L'HOTE NE REPOND PAS";
  if (m === 'connexion impossible') return enLigne ? 'CONNEXION DIRECTE IMPOSSIBLE : RESEAU BLOQUANT' : 'CONNEXION DIRECTE IMPOSSIBLE SUR CE WIFI';
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

/**
 * Multijoueur Wi-Fi (voir net/) : liste des parties, création, salle
 * d'attente, choix des équipes et maillots, match en réseau (hôte ou
 * client), spectateurs et leurs réactions, fin de match et votes, coupures.
 */
export class ParcoursLan {
  /** Où se retrouvent les joueurs : le Wi-Fi, ou le salon d'un code. */
  canal: Canal = CANAL_LOCAL;
  /** Le parcours du jeu en ligne (choix du mode, création et recherche de salon). */
  readonly ligne: ParcoursLigne;
  hote: SessionHote | null = null;
  client: SessionClient | null = null;
  /** Match réseau en cours sur cet appareil (null hors match). */
  jeu: JeuReseau | null = null;
  statut: StatutLan = 'recherche';
  message: string | null = null;
  salonMessage: { txt: string; jusqua: number } | null = null;
  /** Invalide les réponses asynchrones d'un écran réseau qu'on a déjà quitté. */
  private generation = 0;
  /** Client : il a touché JOUER à l'arrivée (il choisit maintenant son siège dans la salle). */
  choixPrise = false;
  /** Dernière phase de partie Wi-Fi appliquée à l'écran. */
  phaseVue: PhaseLan | null = null;
  /** Client : instant (s) de fin du compte à rebours de reprise en cours. */
  finReprise: number | null = null;
  /** Réactions (spectateurs, joueurs à la fin) qui montent le long du bord droit. */
  reactions: ReactionAffichee[] = [];

  /** Dessin des écrans Wi-Fi (vues-lan.ts). */
  readonly vues: VuesLan;
  /** Le match en réseau lui-même (match-lan.ts). */
  readonly match: MatchLan;

  constructor(private readonly app: GameApp) {
    this.ligne = new ParcoursLigne(app, this);
    this.vues = new VuesLan(app, this);
    this.match = new MatchLan(app, this);
  }

  // ------------------------------------------------------------- état

  /** Équipe pilotée sur cet appareil (0 hors réseau). */
  get eqLocal(): TeamId {
    if (this.jeu) return this.jeu.eqLocal;
    const s = this.siege;
    return s === null ? 0 : campDe(s);
  }

  /** État partagé de la partie Wi-Fi (l'original chez l'hôte, la copie reçue chez le client). */
  get partie(): EtatPartieLan | null {
    return this.hote?.partie ?? this.client?.partie ?? null;
  }

  /** Le siège de cet appareil (0 pour l'hôte), ou null s'il ne joue pas. */
  get siege(): Siege | null {
    return this.hote ? 0 : (this.client?.siege ?? null);
  }

  /** Le patineur que cet appareil pilote : le premier ou le second humain de son équipe. */
  pilote(state: MatchState): Skater | null {
    // hors match Wi-Fi (solo, coupe), pas de partie réseau : le joueur pilote l'équipe 0
    return patineurPilote(state, this.jeu ? this.partie : null, this.siege);
  }

  /** Cet appareil regarde la partie sans y jouer. */
  get spectateur(): boolean {
    return !this.hote && !!this.client?.spectateur;
  }

  /** Match en réseau figé (pause demandée par l'un des deux, compte à rebours de reprise, coupure). */
  get pause(): boolean {
    // invité en train de se reconnecter : son écran est figé
    if (this.jeu && this.client?.reconnexion) return true;
    const e = this.partie;
    return !!this.jeu && !!e && e.phase === 'match' && (e.pause !== null || this.repriseRestante() > 0);
  }

  repriseRestante(): number {
    const e = this.partie;
    if (!e || e.pause !== null) return 0;
    if (this.hote) return e.reprise;
    return this.finReprise === null ? 0 : Math.max(0, this.finReprise - performance.now() / 1000);
  }

  /** Toute action de partie passe par l'hôte, y compris celles de l'hôte lui-même. */
  agit(x: ActionLan): void {
    if (this.hote) this.hote.agit(x);
    else this.client?.agit(x);
  }

  /** La latence de chaque siège, mesurée par l'hôte (null si inconnue). */
  pings(): (number | null)[] {
    return this.hote?.pings ?? this.client?.pings ?? [null, null, null, null];
  }

  /** Pause en réseau : elle vaut pour les deux joueurs (l'hôte fige la simulation). */
  demandePause(): void {
    if (!this.pause) {
      this.app.entrees.reinitialise();
      this.agit({ a: 'pause', on: true });
    }
  }

  // ----------------------------------------------------- sessions et écrans

  /** Ferme toute session réseau en cours (annonce retirée, l'autre joueur est prévenu). */
  ferme(): void {
    this.generation++;
    this.hote?.ferme();
    this.hote = null;
    this.client?.ferme();
    this.client = null;
    this.jeu = null;
    this.phaseVue = null;
    this.finReprise = null;
    this.choixPrise = false;
    this.reactions = [];
  }

  /** L'écran des parties : la liste du Wi-Fi, ou l'accueil du jeu en ligne. */
  private get ecranListe(): 'lan' | 'lanLigne' {
    return this.canal.type === 'ligne' ? 'lanLigne' : 'lan';
  }

  /** Retour à l'écran des parties du mode en cours (Wi-Fi : la liste ; en ligne : l'accueil), avec un message. */
  ouvre(message: string | null = null): void {
    if (this.canal.type === 'ligne') this.ligne.accueil(message);
    else this.ouvreSession(message);
  }

  /** Détecte le réseau (ou dérive le salon du code) et écoute les annonces. */
  ouvreSession(message: string | null, canal: Canal = this.canal): void {
    const app = this.app;
    app.audio.init();
    this.ferme();
    this.canal = canal;
    app.creeDemo();
    app.effets.reinitialise();
    app.ecranUI = this.ecranListe;
    app.enPause = false;
    this.statut = 'recherche';
    this.message = message;
    const gen = this.generation;
    SessionClient.cree(canal).then(
      (c) => {
        if (gen !== this.generation) return c.ferme();
        this.client = c;
        this.statut = 'pret';
        c.onCtrl = (m) => this.match.surCtrlClient(m);
        c.onJeu = (buf) => {
          const j = this.jeu;
          const inst = j?.role === 'client' ? decodeInstantane(buf) : null;
          if (j?.role === 'client' && inst) {
            j.synchro.recoit(inst, performance.now() / 1000);
            app.ralenti.enregistre(inst);
          }
        };
        c.onFin = (raison) => this.ouvre(MESSAGES_FIN_CLIENT[raison]);
        c.onChange = () => {
          const e = c.partie;
          if (e) this.finReprise = e.reprise > 0 ? performance.now() / 1000 + e.reprise : null;
          this.suitPhase();
        };
      },
      (e: unknown) => {
        if (gen !== this.generation) return;
        this.statut = 'erreur';
        this.message = messageErreurReseau(e, canal.type === 'ligne');
      },
    );
  }

  quitte(): void {
    this.ferme();
    this.canal = CANAL_LOCAL;
    this.app.retourMenu();
  }

  /** Bouton ACTUALISER : redemande les annonces (ou relance la détection après une erreur). */
  actualise(): void {
    if (this.statut === 'connexion' || this.statut === 'creation') return;
    if (!this.client) {
      this.ouvre();
      return;
    }
    this.message = null;
    this.client.actualise();
  }

  /** CRÉER UNE PARTIE : l'hôte règle d'abord le format du match. */
  ouvreConfig(): void {
    this.ferme();
    this.app.ecranUI = 'lanConfig';
  }

  creePartie(): void {
    const app = this.app;
    const pref = app.pref;
    this.ferme();
    app.ecranUI = this.ecranListe;
    this.statut = 'creation';
    this.message = null;
    const gen = this.generation;
    const config: ConfigLan = {
      effectif: pref.effectif,
      duree: pref.duree,
      assistTir: pref.assistTir,
      assistPasse: pref.assistPasse,
      changementAuto: pref.changementAuto,
      ralenti: pref.ralentiButs,
      pouvoirs: pref.bonus,
      format: pref.formatWifi,
      niveau: pref.niveau,
    };
    const equipeConnue = (id: string) => EQUIPES_JOUABLES.some((e) => e.id === id);
    SessionHote.cree({ nom: pref.pseudo, appareil: pref.appareil, equipe: pref.equipeJoueur, config }, equipeConnue, this.canal).then(
      (h) => {
        if (gen !== this.generation) return h.ferme();
        this.hote = h;
        h.onChange = () => this.suitPhase();
        h.onDebut = () => this.match.lanceMatchHote();
        h.onReaction = (r, de) => this.ajouteReaction(r, de);
        // un appareil arrive en plein match, ou un joueur revient après une coupure : il le prend en route
        const enRoute = (envoie: (m: MsgCtrl) => void) => {
          if (this.jeu?.role === 'hote' && h.partie.phase === 'match') envoie({ t: 'debut', s0: this.match.prochainInstantane });
        };
        h.onArrivee = enRoute;
        h.onJoueurRevenu = enRoute;
        h.onJoueurParti = (raison, nom) => {
          this.salonMessage = {
            txt: raison === 'quitte' ? `${nom} A QUITTE LA PARTIE` : `CONNEXION PERDUE AVEC ${nom}`,
            jusqua: performance.now() / 1000 + 6,
          };
        };
        this.salonMessage = null;
        this.suitPhase();
      },
      (e: unknown) => {
        if (gen !== this.generation) return;
        this.statut = 'erreur';
        this.message = messageErreurReseau(e, this.canal.type === 'ligne');
      },
    );
  }

  /** Rejoint une partie annoncée, comme joueur ou comme spectateur (`spect`). */
  rejoins(p: AnnoncePartie, spect = false): void {
    const c = this.client;
    const pref = this.app.pref;
    if (!c || this.statut !== 'pret') return;
    this.statut = 'connexion';
    this.choixPrise = false;
    this.message = spect ? `CONNEXION AU MATCH DE ${p.nom}` : `CONNEXION A ${p.nom}`;
    const gen = this.generation;
    c.rejoins(p, pref.pseudo, pref.equipeJoueur, pref.appareil, spect).then(
      () => {
        if (gen !== this.generation) return;
        this.statut = 'pret';
        this.message = null;
        this.suitPhase();
      },
      (e: unknown) => {
        if (gen !== this.generation) return;
        this.statut = 'pret';
        this.message = messageErreurReseau(e, this.canal.type === 'ligne');
      },
    );
  }

  /**
   * Aligne l'écran sur la partie partagée et sur notre rôle : salle d'attente
   * (ou choix du rôle à l'arrivée), choix des équipes/maillots, attente du
   * spectateur... Le match et la fin sont pilotés par la simulation elle-même
   * (message `debut`, phase `fin` de l'état de jeu).
   */
  private suitPhase(): void {
    const app = this.app;
    const e = this.partie;
    if (!e) return;
    // tant que la connexion n'est pas finie, le client reste sur la liste
    if (this.client && !this.client.rejointe) return;
    if (e.phase === 'attente' || e.phase === 'equipes' || e.phase === 'maillots') {
      if (this.jeu) {
        this.jeu = null;
        app.creeDemo();
        app.effets.reinitialise();
      }
      const cible = this.ecranLobby(e);
      if (app.ecranUI !== cible) {
        app.ecranUI = cible;
        app.enPause = false;
      }
    } else if (e.phase === 'fin' && this.spectateur && !this.jeu) {
      // arrivé entre deux matchs : on attend le prochain
      app.ecranUI = 'lanSpect';
    }
    this.phaseVue = e.phase;
  }

  /** L'écran de salle d'attente qui convient à la phase et à notre rôle. */
  private ecranLobby(e: EtatPartieLan): EcranUI {
    if (this.hote) return e.phase === 'attente' ? 'salon' : 'lanChoix';
    if (e.phase === 'attente') return this.client?.role?.t === 'indecis' && !this.choixPrise ? 'lanRole' : 'salon';
    return this.spectateur ? 'lanSpect' : 'lanChoix';
  }

  /** Arrivée : l'envie de jouer est exprimée, il reste à toucher un siège libre. */
  veutJouer(): void {
    this.choixPrise = true;
    this.suitPhase();
  }

  /** Prendre un siège libre de la salle d'attente. */
  prendSiege(s: Siege): void {
    this.agit({ a: 'siege', siege: s });
  }

  /** Regarder la partie plutôt que d'y jouer (à l'arrivée, ou en quittant son siège). */
  regarde(): void {
    this.agit({ a: 'spectateur' });
  }

  /**
   * Flèches du choix d'équipe : en 1 contre 1, chacun ne change que sa propre
   * équipe (retenue pour la prochaine fois) ; dans les autres formats, l'hôte
   * règle les deux camps (`camp` 0 : le sien, 1 : l'autre) et les autres ne
   * règlent rien.
   */
  tourneEquipe(sens: 1 | -1, camp?: Camp): void {
    const e = this.partie;
    const s = this.siege;
    const moi = e && s !== null ? e.sieges[s] : null;
    if (!e || s === null || !moi || moi.pret) return;
    const auChoix = hoteChoisit(e.config);
    if (auChoix && !this.hote) return;
    const visee: Camp = auChoix ? (camp ?? 0) : campDe(s);
    const cible = e.camps[visee];
    this.app.audio.clic();
    if (e.phase === 'maillots') {
      this.agit({ a: 'variante', variante: cible.variante === 'interieur' ? 'exterieur' : 'interieur', camp: auChoix ? visee : undefined });
      return;
    }
    const n = EQUIPES_JOUABLES.length;
    const i = Math.max(0, EQUIPES_JOUABLES.findIndex((d) => d.id === cible.equipe));
    const id = EQUIPES_JOUABLES[(i + sens + n) % n]!.id;
    // l'équipe de l'autre camp n'est pas la nôtre : on ne la retient pas
    if (!auChoix || visee === 0) {
      this.app.pref.equipeJoueur = id;
      sauvePreferences(this.app.pref);
    }
    this.agit({ a: 'equipe', equipe: id, camp: auChoix ? visee : undefined });
  }

  private basculePret(): void {
    const s = this.siege;
    const moi = s === null ? null : this.partie?.sieges[s];
    if (moi) this.agit({ a: 'pret', pret: !moi.pret });
  }

  // ----------------------------------------------------------- réactions

  /** Une réaction reçue (ou émise ici, côté hôte) : elle monte le long du bord droit. */
  ajouteReaction(r: string, de: string): void {
    const t = performance.now() / 1000;
    this.reactions = this.reactions.filter((a) => t - a.t0 < REACTION_VIE_S);
    const couloir = this.reactions.length ? (this.reactions[this.reactions.length - 1]!.couloir + 1) % 3 : 0;
    this.reactions.push({ r, de, t0: t, couloir });
    if (this.reactions.length > REACTIONS_MAX) this.reactions.shift();
  }

  /** Envoie une réaction (l'hôte la relaie à tous, y compris à cet écran). */
  reagit(r: string): void {
    if (!estReaction(r)) return;
    if (this.hote) this.hote.reagit(r);
    else this.client?.reagit(r);
  }

  /** Barre de réactions : pour le spectateur en match et à la fin, pour les joueurs à la fin. */
  barreReactionsVisible(): boolean {
    const app = this.app;
    if (!this.jeu) return false;
    if (this.spectateur) return app.ecranUI === 'jeu' || app.ecranUI === 'fin';
    return app.ecranUI === 'fin' && !app.imageFin.seule();
  }

  /** Écussons des deux équipes de la partie Wi-Fi (réactions « logo »). */
  logos(): [string, string] {
    const e = this.partie;
    const eqs = this.app.equipesActuelles;
    if (!e) return [eqs[0].teamId, eqs[1].teamId];
    return [e.camps[0].equipe, e.camps[1].equipe];
  }

  // ---------------------------------------------------------------- clavier

  /** Touches des écrans Wi-Fi, et réactions (1 à 6) sur tous les écrans. */
  touche(e: KeyboardEvent, ecran: EcranUI): void {
    if (e.code === 'Enter') {
      if (ecran === 'lan') this.actualise();
      else if (ecran === 'lanConfig') this.creePartie();
      else if (ecran === 'salon') this.agit({ a: 'lancer' });
      else if (ecran === 'lanChoix') this.basculePret();
    }
    const chiffre = /^(Digit|Numpad)([1-6])$/.exec(e.code);
    if (chiffre && !e.repeat && this.barreReactionsVisible()) this.reagit(CODES_REACTIONS[Number(chiffre[2]) - 1]!);
    if (e.code === 'Escape' && ecran === 'multi') this.app.retourMenu();
    else if (e.code === 'Escape' && ecran === 'lanLigne') this.ligne.retour();
    else if (e.code === 'Escape') {
      if (ecran === 'lanSpect' || ecran === 'salon' || ecran === 'lanRole' || ecran === 'lanConfig') this.ouvre();
      else if (ecran === 'lan') this.quitte();
    }
    if (ecran === 'lanChoix' && !e.repeat) {
      if (e.code === 'ArrowLeft') this.tourneEquipe(-1);
      else if (e.code === 'ArrowRight') this.tourneEquipe(1);
      // l'hôte règle l'autre camp avec haut et bas
      else if (e.code === 'ArrowUp') this.tourneEquipe(-1, 1);
      else if (e.code === 'ArrowDown') this.tourneEquipe(1, 1);
    }
  }
}
