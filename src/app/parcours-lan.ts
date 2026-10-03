import { DUREES, EFFECTIFS } from '@core/constants';
import { creePartie, type OptionsPartie } from '@core/rules';
import { trouveEquipe } from '@core/teams';
import { INTENT_VIDE, type MatchState, type Rink, type Skater, type TeamId } from '@core/types';
import type { AnnoncePartie } from '@net/annuaire';
import {
  campDe,
  compositionHumaine,
  estReaction,
  hoteChoisit,
  joueursAssis,
  patineurPilote,
  SPECTATEURS_MAX,
  siegeReel,
  tousOntPasse,
  type ActionLan,
  type Camp,
  type ConfigLan,
  type EtatPartieLan,
  type PhaseLan,
  type Siege,
} from '@net/partie';
import { angleVersHote, directionVersHote } from '@net/entrees';
import { decodeInstantane, encodeInstantane } from '@net/instantane';
import { evenementsPourEnvoi, type MsgCtrl } from '@net/protocole';
import { SessionClient } from '@net/session-client';
import type { RaisonFin } from '@net/session-commun';
import { SessionHote } from '@net/session-hote';
import { SynchroClient } from '@net/synchro';
import { joueEvenements } from '@audio/sound';
import {
  C,
  CODES_REACTIONS,
  EQUIPES_JOUABLES,
  LIBELLES_FORMAT,
  REACTION_VIE_S,
  REACTIONS_MAX,
  resoutEquipe,
  trouveTeamDef,
  type EquipeVisuelle,
  type ReactionAffichee,
  type StatutLan,
} from '@render/index';
import type { EcranUI } from './ecrans';
import type { GameApp } from './game-app';
import { noteDuel, sauvePreferences } from './preferences';
import { VuesLan } from './vues-lan';
import { dureeBut } from './ralenti';
import { demandePleinEcranPaysage } from './pwa';

/**
 * Match en réseau local : l'hôte simule, chaque joueur affiche et envoie ses
 * entrées (le patineur de son siège) ; un spectateur affiche comme les
 * joueurs, sans rien piloter.
 */
export type JeuReseau =
  | { role: 'hote'; eqLocal: TeamId; dernierEnvoi: number }
  | { role: 'client'; eqLocal: TeamId; synchro: SynchroClient; spectateur: boolean };

function messageErreurReseau(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m === 'reseau') return 'WIFI NON DETECTE - VERIFIEZ LA CONNEXION';
  if (m.startsWith('aucun serveur')) return 'DECOUVERTE INDISPONIBLE - REESSAYEZ';
  if (m === 'complet') return 'CETTE PARTIE EST DEJA COMPLETE';
  if (m === 'spectateurs') return `DEJA ${SPECTATEURS_MAX} SPECTATEURS SUR CETTE PARTIE`;
  if (m === 'version') return 'VERSIONS DIFFERENTES : METTEZ LE JEU A JOUR';
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

/**
 * Multijoueur Wi-Fi (voir net/) : liste des parties, création, salle
 * d'attente, choix des équipes et maillots, match en réseau (hôte ou
 * client), spectateurs et leurs réactions, fin de match et votes, coupures.
 */
export class ParcoursLan {
  hote: SessionHote | null = null;
  client: SessionClient | null = null;
  /** Match réseau en cours sur cet appareil (null hors match). */
  jeu: JeuReseau | null = null;
  statut: StatutLan = 'recherche';
  message: string | null = null;
  salonMessage: { txt: string; jusqua: number } | null = null;
  /** Invalide les réponses asynchrones d'un écran réseau qu'on a déjà quitté. */
  private generation = 0;
  private seqInstantane = 0;
  /** Client : il a touché JOUER à l'arrivée (il choisit maintenant son siège dans la salle). */
  choixPrise = false;
  /** Hôte, pendant un match : le siège de chaque humain du simulateur (indice `équipe * 2 + rang`). */
  private siegesCore: (Siege | null)[] = [null, null, null, null];
  /** Dernière phase de partie Wi-Fi appliquée à l'écran. */
  private phaseVue: PhaseLan | null = null;
  /** Client : instant (s) de fin du compte à rebours de reprise en cours. */
  private finReprise: number | null = null;
  /** Réactions (spectateurs, joueurs à la fin) qui montent le long du bord droit. */
  reactions: ReactionAffichee[] = [];
  /** Hôte : phase de jeu vue à l'image précédente (détection des buts pour le ralenti). */
  private phaseHote: string | null = null;

  /** Dessin des écrans Wi-Fi (vues-lan.ts). */
  readonly vues: VuesLan;

  constructor(private readonly app: GameApp) {
    this.vues = new VuesLan(app, this);
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

  /** Hôte : le siège réel de l'humain `rang` de l'équipe `eq` du simulateur. */
  siegeCore(eq: TeamId, partenaire: boolean): Siege | null {
    return this.siegesCore[eq * 2 + (partenaire ? 1 : 0)] ?? null;
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

  /** Écran de la liste des parties : détecte le réseau et écoute les annonces. */
  ouvre(message: string | null = null): void {
    const app = this.app;
    app.audio.init();
    this.ferme();
    app.creeDemo();
    app.effets.reinitialise();
    app.ecranUI = 'lan';
    app.enPause = false;
    this.statut = 'recherche';
    this.message = message;
    const gen = this.generation;
    SessionClient.cree().then(
      (c) => {
        if (gen !== this.generation) return c.ferme();
        this.client = c;
        this.statut = 'pret';
        c.onCtrl = (m) => this.surCtrlClient(m);
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
        this.message = messageErreurReseau(e);
      },
    );
  }

  quitte(): void {
    this.ferme();
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
    app.ecranUI = 'lan';
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
    SessionHote.cree({ nom: pref.pseudo, appareil: pref.appareil, equipe: pref.equipeJoueur, config }, equipeConnue).then(
      (h) => {
        if (gen !== this.generation) return h.ferme();
        this.hote = h;
        h.onChange = () => this.suitPhase();
        h.onDebut = () => this.lanceMatchHote();
        h.onReaction = (r, de) => this.ajouteReaction(r, de);
        // un appareil arrive en plein match, ou un joueur revient après une coupure : il le prend en route
        const enRoute = (envoie: (m: MsgCtrl) => void) => {
          if (this.jeu?.role === 'hote' && h.partie.phase === 'match') envoie({ t: 'debut', s0: this.seqInstantane + 1 });
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
        this.message = messageErreurReseau(e);
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
        this.message = messageErreurReseau(e);
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

  // ------------------------------------------------------ match en réseau

  /** Hôte : tous les joueurs ont validé, le match commence. */
  private lanceMatchHote(): void {
    const h = this.hote;
    if (!h) return;
    h.envoieCtrl({ t: 'debut', s0: this.seqInstantane + 1 });
    this.demarreMatch(h.partie, { role: 'hote', eqLocal: 0, dernierEnvoi: 0 });
  }

  private demarreMatch(e: EtatPartieLan, jeu: JeuReseau): void {
    const app = this.app;
    app.audio.init();
    void demandePleinEcranPaysage();
    const [c0, c1] = e.camps;
    const eqs: [EquipeVisuelle, EquipeVisuelle] = [resoutEquipe(trouveTeamDef(c0.equipe), c0.variante), resoutEquipe(trouveTeamDef(c1.equipe), c1.variante)];
    const comp = compositionHumaine(e);
    this.siegesCore = [siegeReel(e, 0, 0), siegeReel(e, 0, 1), siegeReel(e, 1, 0), siegeReel(e, 1, 1)];
    app.equipesActuelles = eqs;
    app.effets.definitEquipes(eqs);
    app.construitDecor();
    const c = e.config;
    const options: OptionsPartie = {
      mode: 'match',
      // versus : coéquipiers CPU au même niveau des deux côtés, seul le talent des humains départage ;
      // coop : le niveau du CPU est celui que l'hôte a réglé
      niveauIdx: c.format === 'coop' ? c.niveau : 1,
      dureeIdx: Math.min(c.duree, DUREES.length - 1),
      effectifIdx: Math.min(c.effectif, EFFECTIFS.length - 1),
      equipeJoueur: trouveEquipe(eqs[0].teamId),
      equipeAdverse: trouveEquipe(eqs[1].teamId),
      assistTir: c.assistTir,
      assistPasse: c.assistPasse,
      changementAuto: c.changementAuto,
      humains: comp.humains,
      duo: comp.duo,
      bonus: c.format === 'coop' ? ['aucun', 'aucun'] : [...e.bonus],
      dureeBut: dureeBut(c.ralenti),
      pouvoirs: c.pouvoirs,
    };
    this.phaseHote = null;
    app.demarreRalenti(options);
    app.state = creePartie(app.rink!, options);
    this.jeu = jeu;
    this.phaseVue = 'match';
    // repris en route (retour après une coupure) : le compte à rebours de reprise est peut-être en cours
    this.finReprise = e.reprise > 0 ? performance.now() / 1000 + e.reprise : null;
    app.cumul = 0;
    app.effets.reinitialise();
    app.entrees.reinitialise();
    app.ecranUI = 'jeu';
    app.enPause = false;
    // repris en route : le compte à rebours de reprise suffit
    if (this.finReprise === null) app.effets.annonce('PRETS ?', c.format === '1v1' ? 'MATCH EN RESEAU' : LIBELLES_FORMAT[c.format], C.blanc, 1.5);
  }

  private surCtrlClient(m: MsgCtrl): void {
    if (m.t === 'debut') {
      const c = this.client;
      const e = c?.partie;
      if (c && e) {
        const s = c.siege;
        this.demarreMatch(e, { role: 'client', eqLocal: s === null ? 0 : campDe(s), synchro: new SynchroClient(m.s0), spectateur: s === null });
      }
    } else if (m.t === 'reaction') {
      this.ajouteReaction(m.r, m.de);
    } else if (m.t === 'ev') {
      if (this.jeu?.role === 'client') this.jeu.synchro.recoitEvenements(m.k, m.l);
    }
  }

  /**
   * Hôte, à chaque image et sur tous les écrans : compte à rebours de
   * reprise, attente d'un invité absent (qui peut tomber hors match aussi),
   * et score du match en cours repris dans l'annonce.
   */
  avanceHote(dt: number, state: MatchState | null): void {
    const h = this.hote;
    if (!h) return;
    h.avance(dt);
    if (this.jeu && state) h.majScore(state.score);
  }

  /** Hôte : évènements du pas (sons, particules...) pour l'invité et les spectateurs. */
  diffuseEvenements(state: MatchState): void {
    if (this.jeu) this.hote?.envoieCtrl({ t: 'ev', k: state.temps, l: evenementsPourEnvoi(state.evenements) });
  }

  /** Hôte : ~60 instantanés/s en jeu ; 4/s suffisent pendant une pause (rien ne bouge). */
  diffuseInstantane(state: MatchState, rink: Rink, t: number): void {
    const j = this.jeu;
    if (!this.hote || j?.role !== 'hote' || t - j.dernierEnvoi < (this.pause ? 250 : 12)) return;
    this.hote.envoieJeu(encodeInstantane(state, rink, ++this.seqInstantane));
    j.dernierEnvoi = t;
  }

  /** Hôte : nouveau but → votes « passer » remis à zéro ; tous ont passé → remise en jeu. */
  arbitreRalenti(state: MatchState): void {
    const h = this.hote;
    if (this.jeu?.role !== 'hote' || !h) return;
    if (state.phase === 'but' && this.phaseHote !== 'but') h.debutRalenti();
    this.phaseHote = state.phase;
    if (state.phase === 'but' && tousOntPasse(h.partie)) state.phaseT = Math.min(state.phaseT, 0.4);
  }

  /** Client : envoie ses entrées, puis affiche l'état interpolé reçu de l'hôte. */
  boucleClient(dt: number): void {
    const app = this.app;
    const j = this.jeu;
    const state = app.state;
    const rink = app.rink;
    const c = this.client;
    if (j?.role !== 'client' || !state || !rink || !c) return;
    const synchro = j.synchro;
    const maintenant = performance.now() / 1000;
    let intent = app.ecranUI === 'jeu' && !this.pause && !this.spectateur ? app.entrees.consomme() : INTENT_VIDE;
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
      joueEvenements(app.audio, evs);
      app.effets.traite(evs);
    }
    app.effets.maj(dt);
    app.majRalenti(state, dt, false);
    if (state.phase === 'fin' && app.ecranUI === 'jeu') app.surFinMatch();
  }

  /** Fin d'un match réseau : place au vote côté hôte, et bilan des duels gardé sur chaque appareil. */
  finMatch(state: MatchState): void {
    if (!this.jeu) return;
    if (this.jeu.role === 'hote') this.hote?.finMatch();
    this.phaseVue = 'fin';
    // le bilan des duels ne compte que le 1 contre 1
    const e = this.partie;
    const adversaire = e && e.config.format === '1v1' ? joueursAssis(e).find((j) => j.appareil !== this.app.pref.appareil) : null;
    if (adversaire && !this.spectateur) {
      const moi = this.eqLocal;
      const eux = moi === 0 ? 1 : 0;
      const sc = state.score;
      noteDuel(this.app.pref, adversaire.appareil, adversaire.nom, sc[moi] > sc[eux] ? 'v' : sc[moi] < sc[eux] ? 'd' : 'n');
    }
  }

  // ----------------------------------------------------------- réactions

  /** Une réaction reçue (ou émise ici, côté hôte) : elle monte le long du bord droit. */
  private ajouteReaction(r: string, de: string): void {
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
    if (e.code === 'Escape') {
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
