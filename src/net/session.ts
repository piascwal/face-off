import { Annuaire, COURTIERS, type AnnoncePartie, type Signal } from './annuaire';
import { Liaison } from './liaison';
import { INTENT_VIDE, type InputIntent } from '@core/types';
import {
  appliqueAction,
  arrive,
  avanceAbsence,
  avanceReprise,
  campDe,
  debutRalenti,
  joueurAbsent,
  joueurPart,
  joueurRevenu,
  joueursAssis,
  nbRegardeurs,
  nouvellePartie,
  RECONNEXION_S,
  regardeurPart,
  roleDe,
  siegeDeAppareil,
  SPECTATEURS_MAX,
  versAttente,
  versFin,
  type ActionLan,
  type ConfigLan,
  type EtatPartieLan,
  type Reaction,
  type Role,
  type Siege,
} from './partie';
import { bonjour, EmetteurEntrees, EntreeDistante, lisCtrl, type MsgCtrl } from './protocole';
import { detecteReseaux, idAleatoire, salonPour, VERSION_PROTOCOLE, type Salon } from './reseau-local';

/**
 * Sessions de jeu en réseau local : l'appareil hôte *est* le serveur.
 *
 * Découverte : l'hôte publie une annonce chiffrée dans le salon de son
 * réseau (voir reseau-local / annuaire) ; le client liste les annonces de son
 * propre réseau, choisit une partie et dépose son offre WebRTC dans la boîte
 * de l'hôte. Dès que la liaison directe est ouverte, plus rien ne passe par
 * les serveurs de découverte : le client s'en déconnecte.
 *
 * Coupure pendant une partie (Wi-Fi qui décroche, téléphone mis en veille) :
 * l'hôte garde le siège du joueur et fige le match ; le joueur relance seul
 * la découverte, retrouve l'annonce de l'hôte et se reconnecte avec le jeton
 * secret donné à son arrivée (voir `joueurAbsent` dans partie.ts).
 */

export type RaisonFin = 'quitte' | 'exclu' | 'perdu' | 'complet' | 'version' | 'injoignable';

const PING_MS = 1000;
const SILENCE_MAX_MS = 6000;
/** Une réaction au plus toutes les 0,4 s par appareil (anti-matraquage). */
const REACTION_MIN_MS = 400;

/**
 * Options de développement (jamais actives en production) : réseau et
 * serveur de découverte locaux, délai de reconnexion raccourci (tests).
 */
function reglagesDev(): { reseau: string | null; courtiers: string[] | null; reconnexionS: number | null } {
  if (!import.meta.env.DEV) return { reseau: null, courtiers: null, reconnexionS: null };
  const q = new URLSearchParams(location.search);
  const r = Number(q.get('reconnexion'));
  return {
    reseau: q.get('reseau'),
    courtiers: q.get('courtier') ? [q.get('courtier')!] : null,
    reconnexionS: r > 0 && r <= 600 ? r : null,
  };
}

/** Temps laissé à l'invité pour revenir après une coupure (s). */
function delaiReconnexion(): number {
  return reglagesDev().reconnexionS ?? RECONNEXION_S;
}

const attente = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function salonsDuReseau(): Promise<Salon[]> {
  const dev = reglagesDev();
  const cles = dev.reseau ? [`dev:${dev.reseau}`] : await detecteReseaux();
  if (!cles.length) throw new Error('reseau');
  return Promise.all(cles.map(salonPour));
}

function courtiers(): string[] {
  return reglagesDev().courtiers ?? COURTIERS;
}

/** Surveille une liaison : ping/pong pour la latence, et coupure si le pair se tait trop longtemps. */
class Veille {
  latenceMs: number | null = null;
  private dernierRecu = performance.now();
  private readonly minuteur: ReturnType<typeof setInterval>;

  constructor(
    private readonly liaison: Liaison,
    surSilence: () => void,
  ) {
    this.minuteur = setInterval(() => {
      if (performance.now() - this.dernierRecu > SILENCE_MAX_MS) surSilence();
      else liaison.envoieCtrl({ t: 'ping', k: performance.now() });
    }, PING_MS);
  }

  /** À appeler pour tout message reçu ; renvoie true s'il s'agissait d'un ping/pong (déjà traité). */
  recu(m: MsgCtrl): boolean {
    this.dernierRecu = performance.now();
    if (m.t === 'ping') {
      this.liaison.envoieCtrl({ t: 'pong', k: m.k });
      return true;
    }
    if (m.t === 'pong') {
      const rtt = performance.now() - m.k;
      if (rtt >= 0 && rtt < 10_000) this.latenceMs = this.latenceMs === null ? rtt : this.latenceMs * 0.7 + rtt * 0.3;
      return true;
    }
    return false;
  }

  recuJeu(): void {
    this.dernierRecu = performance.now();
  }

  arrete(): void {
    clearInterval(this.minuteur);
  }
}

// ==================================================================== hôte ==

export interface InfosHote {
  nom: string;
  appareil: string;
  equipe: string;
  config: ConfigLan;
}

/** Un appareil branché sur l'hôte : joueur, spectateur ou arrivant qui n'a pas encore choisi. */
interface Membre {
  l: Liaison;
  veille: Veille | null;
  /** Connu une fois son « bonjour » reçu. */
  nom: string | null;
  appareil: string;
  /** Jeton secret : le même jeton rend son siège à un joueur qui revient après une coupure. */
  jeton: string;
  /** L'équipe qu'il préfère (reprise quand il prend la place de droite en 1 contre 1). */
  equipe: string;
  /** Entrées du joueur, reconstruites pas à pas. */
  entree: EntreeDistante;
  code: string | null;
}

/** Appareils branchés au plus : 3 autres joueurs, et des spectateurs. */
const MEMBRES_MAX = 3 + SPECTATEURS_MAX;

export class SessionHote {
  /** État partagé de la partie ; l'hôte en est le seul arbitre. */
  readonly partie: EtatPartieLan;
  onChange: () => void = () => {};
  /** Tous les joueurs ont validé (maillots, ou vote « rejouer ») : l'app lance le match. */
  onDebut: () => void = () => {};
  onJoueurParti: (raison: RaisonFin, nom: string) => void = () => {};
  /** Réaction relayée à tous (spectateur, ou joueur sur l'écran de fin) : à afficher ici aussi. */
  onReaction: (r: Reaction, de: string) => void = () => {};
  /**
   * Un appareil vient de se présenter (état de la partie déjà envoyé) : si un
   * match est en cours, l'app lui envoie `debut` pour qu'il le prenne en route.
   */
  onArrivee: (envoie: (m: MsgCtrl) => void) => void = () => {};
  /** Un joueur est revenu après une coupure (état déjà envoyé) : en plein match, l'app lui renvoie `debut`. */
  onJoueurRevenu: (envoie: (m: MsgCtrl) => void) => void = () => {};

  private membres: Membre[] = [];
  /** Jeton de chaque joueur absent dont le siège est gardé. */
  private gardes = new Map<Siege, string>();
  private score: [number, number] = [0, 0];
  /** Dernière réaction de chaque auteur (anti-matraquage). */
  private dernieresReactions = new Map<string, number>();
  private ferme_ = false;

  private constructor(
    private readonly annuaire: Annuaire,
    infos: InfosHote,
    private readonly equipeConnue: (id: string) => boolean,
  ) {
    this.partie = nouvellePartie(infos.config, infos.nom, infos.equipe, infos.appareil);
  }

  static async cree(infos: InfosHote, equipeConnue: (id: string) => boolean): Promise<SessionHote> {
    const salons = await salonsDuReseau();
    const annuaire = new Annuaire(salons, courtiers(), true);
    await annuaire.ouvre();
    const s = new SessionHote(annuaire, infos, equipeConnue);
    annuaire.onSignal = (de, salon, sig) => void s.surSignal(de, salon, sig);
    s.annonce();
    return s;
  }

  /** La plus mauvaise latence parmi les appareils branchés (null s'il n'y en a pas). */
  get latenceMs(): number | null {
    let pire: number | null = null;
    for (const m of this.presents) {
      const ms = m.veille?.latenceMs ?? null;
      if (ms !== null && (pire === null || ms > pire)) pire = ms;
    }
    return pire;
  }

  /** Un appareil est en train de se connecter (offre reçue, pas encore présenté). */
  get connexionEnCours(): boolean {
    return this.membres.some((m) => m.nom === null);
  }

  /** Appareils présentés (bonjour reçu). */
  private get presents(): Membre[] {
    return this.membres.filter((m) => m.nom !== null);
  }

  /** Code de vérification de la liaison d'un appareil (le même s'affiche chez lui). */
  codeDe(appareil: string): string | null {
    return this.presents.find((m) => m.appareil === appareil)?.code ?? null;
  }

  /** Latence de la liaison d'un appareil. */
  latenceDe(appareil: string): number | null {
    return this.presents.find((m) => m.appareil === appareil)?.veille?.latenceMs ?? null;
  }

  /** Cet appareil est-il connecté en ce moment (un joueur absent ne l'est pas) ? */
  connecte(appareil: string): boolean {
    return this.presents.some((m) => m.appareil === appareil);
  }

  /**
   * Annonce la partie sur le réseau, y compris quand elle est lancée : on
   * peut toujours venir la regarder (score et nombre de spectateurs à jour).
   */
  private annonce(): void {
    if (this.ferme_) return;
    const p = this.partie;
    const c = p.config;
    this.annuaire.annonce({
      nom: p.sieges[0]!.nom,
      equipe: p.camps[0].equipe,
      effectif: c.effectif,
      duree: c.duree,
      enCours: p.phase !== 'attente',
      format: c.format,
      joueurs: joueursAssis(p).length,
      spect: nbRegardeurs(p),
      adverse: p.camps[1].equipe,
      score: [...this.score],
    });
  }

  /** Score du match en cours, repris dans l'annonce (liste des parties des spectateurs). */
  majScore(score: [number, number]): void {
    if (score[0] === this.score[0] && score[1] === this.score[1]) return;
    this.score = [score[0], score[1]];
    this.annonce();
  }

  get nbSpectateurs(): number {
    return nbRegardeurs(this.partie);
  }

  /** Envoie l'état de la partie à tous les appareils, et prévient l'app. */
  private diffuse(): void {
    const m: MsgCtrl = { t: 'etat', e: this.partie };
    for (const x of this.presents) x.l.envoieCtrl(m);
    this.onChange();
  }

  /** Réaction d'un joueur de l'hôte (écran de fin seulement). */
  reagit(r: Reaction): void {
    if (this.partie.phase === 'fin') this.relaieReaction(r, this.partie.sieges[0]!.nom);
  }

  private relaieReaction(r: Reaction, de: string): void {
    const t = performance.now();
    if (t - (this.dernieresReactions.get(de) ?? -Infinity) < REACTION_MIN_MS) return;
    this.dernieresReactions.set(de, t);
    const m: MsgCtrl = { t: 'reaction', r, de };
    for (const x of this.presents) x.l.envoieCtrl(m);
    this.onReaction(r, de);
  }

  /** Applique une action de l'hôte lui-même (mêmes règles que pour les autres). */
  agit(action: ActionLan): void {
    const debut = appliqueAction(this.partie, this.partie.sieges[0]!.appareil, action, this.equipeConnue);
    this.annonce();
    this.diffuse();
    if (debut) this.onDebut();
  }

  /** Un but vient d'être marqué : le ralenti repart, personne ne l'a encore passé. */
  debutRalenti(): void {
    debutRalenti(this.partie);
    this.diffuse();
  }

  /** Le match s'est terminé : place au vote « rejouer / changer d'équipes ». */
  finMatch(): void {
    versFin(this.partie);
    this.annonce();
    this.diffuse();
  }

  /** Fait avancer le compte à rebours de reprise après une pause, et l'attente des joueurs absents. */
  avance(dt: number): void {
    const absence = avanceAbsence(this.partie, dt);
    if (absence === 'fini') this.finAbsence();
    else if (absence === 'change') this.diffuse();
    if (avanceReprise(this.partie, dt)) this.diffuse();
  }

  /** Secondes qu'il reste aux joueurs absents pour revenir (0 : tout le monde est là). */
  get absence(): number {
    return this.partie.absent;
  }

  /** L'hôte n'attend plus les joueurs partis : retour en salle d'attente. */
  arreteAttente(): void {
    if (this.partie.absent > 0) this.finAbsence();
  }

  /** Les joueurs absents ne sont pas revenus à temps : leurs sièges sont libérés. */
  private finAbsence(): void {
    const noms = this.partie.absents.map((s) => this.partie.sieges[s]?.nom ?? '').filter(Boolean);
    this.gardes.clear();
    versAttente(this.partie);
    this.annonce();
    this.diffuse();
    if (noms.length) this.onJoueurParti('perdu', noms.join(' ET '));
  }

  private async surSignal(de: string, salon: number, sig: Signal): Promise<void> {
    if (sig.type !== 'offre' || this.ferme_) return;
    if (this.membres.length >= MEMBRES_MAX) {
      await this.annuaire.signale(de, salon, { type: 'refus', raison: 'complet' });
      return;
    }
    // les regardeurs (spectateurs et indécis) ont leur plafond : au-delà, on ne peut plus que revenir sur son siège gardé
    if (nbRegardeurs(this.partie) + this.membres.filter((m) => m.nom === null).length >= SPECTATEURS_MAX && this.partie.absent <= 0) {
      await this.annuaire.signale(de, salon, { type: 'refus', raison: 'spectateurs' });
      return;
    }
    const l = new Liaison();
    const m: Membre = { l, veille: null, nom: null, appareil: '', jeton: '', equipe: '', entree: new EntreeDistante(), code: null };
    this.membres.push(m);
    this.onChange();
    try {
      const sdp = await l.accepteOffre(sig.sdp);
      await this.annuaire.signale(de, salon, { type: 'reponse', sdp });
      await l.ouverte();
      m.code = await l.codeVerification();
    } catch {
      this.retire(m);
      this.onChange();
      return;
    }
    if (!this.membres.includes(m)) return;
    // on attend le « bonjour » pour connaître son nom
    l.onCtrl = (o) => this.surCtrl(m, o);
    l.onJeu = (d) => {
      if (m.entree.recoit(d, performance.now() / 1000)) m.veille?.recuJeu();
    };
    l.onFerme = () => this.parti(m, 'perdu');
    m.veille = new Veille(l, () => l.ferme());
    // un pair qui ouvre la liaison sans jamais se présenter ne bloque pas la partie
    setTimeout(() => {
      if (m.nom === null && this.membres.includes(m)) {
        this.retire(m);
        this.onChange();
      }
    }, 10_000);
  }

  private surCtrl(m: Membre, o: unknown): void {
    if (!this.membres.includes(m)) return;
    const msg = lisCtrl(o);
    if (!msg || m.veille?.recu(msg)) return;
    const p = this.partie;
    if (msg.t === 'bonjour') {
      if (msg.v !== VERSION_PROTOCOLE || m.nom !== null) {
        this.retire(m);
        this.onChange();
        return;
      }
      // un joueur absent revient avec son jeton : il retrouve son siège
      const siege = [...this.gardes].find(([s, j]) => j === msg.jeton && p.absents.includes(s))?.[0];
      if (siege !== undefined) {
        this.gardes.delete(siege);
        Object.assign(m, { nom: msg.nom, appareil: msg.appareil, jeton: msg.jeton, equipe: msg.equipe });
        joueurRevenu(p, siege);
        this.annonce();
        this.diffuse();
        this.onJoueurRevenu((x) => m.l.envoieCtrl(x));
        return;
      }
      // un appareil déjà présent (ancienne liaison pas encore tombée) ne se présente pas deux fois
      if (roleDe(p, msg.appareil) || this.membres.some((x) => x !== m && x.nom !== null && x.appareil === msg.appareil)) {
        this.retire(m);
        this.onChange();
        return;
      }
      Object.assign(m, { nom: msg.nom, appareil: msg.appareil, jeton: msg.jeton, equipe: msg.equipe });
      arrive(p, msg.nom, msg.appareil);
      // venu pour regarder seulement : pas la peine de choisir
      if (msg.spect && p.phase === 'attente') appliqueAction(p, msg.appareil, { a: 'spectateur' });
      this.annonce();
      this.diffuse();
      this.onArrivee((x) => m.l.envoieCtrl(x));
    } else if (m.nom === null) {
      // rien d'autre n'est accepté d'un appareil qui ne s'est pas présenté
    } else if (msg.t === 'action') {
      const avant = p.sieges.map((j) => j?.appareil ?? null);
      const debut = appliqueAction(p, m.appareil, msg.x, this.equipeConnue);
      if (msg.x.a === 'siege') this.prendEquipePreferee(m, avant);
      this.annonce();
      this.diffuse();
      if (debut) this.onDebut();
    } else if (msg.t === 'reaction') {
      // les joueurs ne réagissent que sur l'écran de fin (pendant le match, les doigts sont pris)
      const role = roleDe(p, m.appareil);
      if (role && (role.t !== 'siege' || p.phase === 'fin')) this.relaieReaction(msg.r, m.nom);
    } else if (msg.t === 'quitte') {
      this.parti(m, 'quitte');
    }
  }

  /** 1 contre 1 : le premier arrivé du camp de droite y apporte l'équipe qu'il préfère. */
  private prendEquipePreferee(m: Membre, avant: (string | null)[]): void {
    const p = this.partie;
    if (p.config.format !== '1v1' || p.phase !== 'attente') return;
    const s = siegeDeAppareil(p, m.appareil);
    if (s === null || campDe(s) !== 1 || avant[s] === m.appareil) return;
    if (m.equipe && this.equipeConnue(m.equipe)) p.camps[1].equipe = m.equipe;
  }

  /** Ferme la liaison d'un appareil et l'oublie, sans toucher à la partie. */
  private retire(m: Membre): void {
    const i = this.membres.indexOf(m);
    if (i < 0) return;
    this.membres.splice(i, 1);
    m.l.onFerme = () => {};
    m.l.ferme();
    m.veille?.arrete();
  }

  /** Un appareil est parti (volontairement, ou la liaison est tombée). */
  private parti(m: Membre, raison: RaisonFin): void {
    if (!this.membres.includes(m)) return;
    const p = this.partie;
    const role = m.nom !== null ? roleDe(p, m.appareil) : null;
    this.retire(m);
    if (!role) {
      this.onChange();
      return;
    }
    if (role.t !== 'siege') {
      regardeurPart(p, m.appareil);
      this.annonce();
      this.diffuse();
      return;
    }
    const s = role.siege;
    // coupure (pas un départ volontaire) : on garde son siège et on fige le match
    if (raison === 'perdu' && joueurAbsent(p, s, delaiReconnexion())) {
      this.gardes.set(s, m.jeton);
      this.annonce();
      this.diffuse();
      return;
    }
    const nom = p.sieges[s]?.nom ?? '';
    joueurPart(p, s);
    // un joueur de moins en cours de route : tout le monde retourne en salle d'attente
    if (p.phase !== 'attente') versAttente(p);
    this.annonce();
    this.diffuse();
    this.onJoueurParti(raison, nom);
  }

  /** Intention du joueur assis au siège `s` pour le prochain pas de simulation (vide s'il est absent). */
  entreeSiege(s: Siege, maintenant: number): InputIntent {
    const j = this.partie.sieges[s];
    const m = j ? this.presents.find((x) => x.appareil === j.appareil) : undefined;
    return m ? m.entree.prochain(maintenant) : INTENT_VIDE;
  }

  /** L'hôte exclut un appareil de la partie. */
  exclut(appareil: string): void {
    const m = this.presents.find((x) => x.appareil === appareil);
    if (!m) return;
    const p = this.partie;
    const role = roleDe(p, appareil);
    m.l.envoieCtrl({ t: 'exclu' } satisfies MsgCtrl);
    m.l.onCtrl = () => {};
    if (role?.t === 'siege') {
      joueurPart(p, role.siege);
      if (p.phase !== 'attente') versAttente(p);
    } else regardeurPart(p, appareil);
    this.annonce();
    this.diffuse();
    // laisse partir le message avant de couper
    setTimeout(() => this.retire(m), 150);
  }

  /** Message de match (début, évènements) : pour tous les appareils. */
  envoieCtrl(m: MsgCtrl): void {
    for (const x of this.presents) x.l.envoieCtrl(m);
  }

  envoieJeu(data: ArrayBuffer): void {
    for (const x of this.presents) x.l.envoieJeu(data);
  }

  ferme(): void {
    if (this.ferme_) return;
    this.ferme_ = true;
    for (const m of this.membres) {
      m.l.envoieCtrl({ t: 'quitte' } satisfies MsgCtrl);
      m.l.onFerme = () => {};
      m.veille?.arrete();
      setTimeout(() => m.l.ferme(), 150);
    }
    this.membres = [];
    this.annuaire.ferme();
  }
}

// ================================================================== client ==

export class SessionClient {
  parties: AnnoncePartie[] = [];
  /** Partie rejointe (salon d'attente ou match). */
  rejointe: AnnoncePartie | null = null;
  /** Dernier état de la partie diffusé par l'hôte. */
  partie: EtatPartieLan | null = null;
  code: string | null = null;
  /** Rejointe depuis « REGARDER » : on n'y vient que pour la regarder. */
  private veutRegarder = false;
  /** Connexion perdue en pleine partie : on tente de revenir jusqu'à cet instant (performance.now, ms). */
  reconnexion: { limite: number } | null = null;
  onChange: () => void = () => {};
  onCtrl: (m: MsgCtrl) => void = () => {};
  onJeu: (data: ArrayBuffer) => void = () => {};
  onFin: (raison: RaisonFin) => void = () => {};

  private liaison: Liaison | null = null;
  private veille: Veille | null = null;
  private emetteur = new EmetteurEntrees();
  private vues = new Map<string, number>();
  private readonly nettoyage: ReturnType<typeof setInterval>;
  private attenteReponse: ((s: Signal) => void) | null = null;
  /** Notre identité et notre jeton secret dans la partie rejointe (pour y revenir). */
  private identite: { nom: string; equipe: string; appareil: string; jeton: string } | null = null;
  private generationReconnexion = 0;

  private constructor(private annuaire: Annuaire | null) {
    this.nettoyage = setInterval(() => this.oublieVieilles(), 5000);
  }

  /** Détecte le réseau, se connecte à la découverte et commence à écouter les parties. */
  static async cree(): Promise<SessionClient> {
    const salons = await salonsDuReseau();
    const annuaire = new Annuaire(salons, courtiers(), false);
    await annuaire.ouvre();
    const s = new SessionClient(annuaire);
    annuaire.onAnnonce = (a) => {
      s.vues.set(a.id, performance.now());
      const i = s.parties.findIndex((p) => p.id === a.id);
      if (i >= 0) s.parties[i] = a;
      else s.parties.push(a);
      s.onChange();
    };
    annuaire.onRetrait = (id) => {
      s.parties = s.parties.filter((p) => p.id !== id);
      s.onChange();
    };
    annuaire.onSignal = (_de, _salon, sig) => s.attenteReponse?.(sig);
    annuaire.ecouteAnnonces();
    return s;
  }

  get latenceMs(): number | null {
    return this.veille?.latenceMs ?? null;
  }

  /** Notre rôle dans la partie, d'après l'état diffusé par l'hôte (null avant le premier). */
  get role(): Role | null {
    const e = this.partie;
    return e && this.identite ? roleDe(e, this.identite.appareil) : null;
  }

  /** Notre siège, ou null si nous ne jouons pas (spectateur, indécis, pas encore présenté). */
  get siege(): Siege | null {
    const e = this.partie;
    return e && this.identite ? siegeDeAppareil(e, this.identite.appareil) : null;
  }

  /** Nous regardons seulement : pas d'entrées à envoyer, des réactions. */
  get spectateur(): boolean {
    return this.siege === null;
  }

  /** Bouton « actualiser » : on vide la liste et on redemande les annonces retenues. */
  actualise(): void {
    this.parties = [];
    this.vues.clear();
    this.annuaire?.ecouteAnnonces();
    this.onChange();
  }

  /** Une annonce que l'hôte ne rafraîchit plus (toutes les 30 s) disparaît de la liste. */
  private oublieVieilles(): void {
    const limite = performance.now() - 75_000;
    const avant = this.parties.length;
    this.parties = this.parties.filter((p) => (this.vues.get(p.id) ?? 0) > limite);
    if (this.parties.length !== avant) this.onChange();
  }

  /** Rejoint une partie comme joueur, ou comme spectateur (`spect`). */
  async rejoins(partie: AnnoncePartie, nom: string, equipe: string, appareil: string, spect = false): Promise<void> {
    if (!this.annuaire || this.liaison) return;
    if (partie.v !== VERSION_PROTOCOLE) throw new Error('version');
    this.veutRegarder = spect;
    this.identite = { nom, equipe, appareil, jeton: idAleatoire(16) };
    await this.connecte(partie);
  }

  /** Liaison directe avec l'hôte de `partie`, puis présentation (bonjour avec notre jeton). */
  private async connecte(partie: AnnoncePartie): Promise<void> {
    const annuaire = this.annuaire;
    const id = this.identite;
    if (!annuaire || !id || this.liaison) throw new Error('injoignable');
    const { nom, equipe, appareil, jeton } = id;
    const spect = this.veutRegarder;
    const l = new Liaison();
    this.liaison = l;
    this.emetteur = new EmetteurEntrees();
    try {
      const sdp = await l.creeOffre();
      const reponse = new Promise<Signal>((resoudre, rejeter) => {
        const garde = setTimeout(() => rejeter(new Error('injoignable')), 12_000);
        this.attenteReponse = (s) => {
          clearTimeout(garde);
          resoudre(s);
        };
      });
      await annuaire.signale(partie.id, partie.salon, { type: 'offre', sdp, nom, spect });
      const r = await reponse;
      this.attenteReponse = null;
      if (r.type === 'refus') throw new Error(r.raison);
      if (r.type !== 'reponse') throw new Error('injoignable');
      await l.accepteReponse(r.sdp);
      await l.ouverte();
      this.code = await l.codeVerification();
    } catch (e) {
      this.attenteReponse = null;
      l.onFerme = () => {};
      l.ferme();
      this.liaison = null;
      throw e;
    }
    this.rejointe = partie;
    l.onCtrl = (o) => {
      const m = lisCtrl(o);
      if (!m || this.veille?.recu(m)) return;
      if (m.t === 'etat') {
        this.partie = m.e;
        this.onChange();
      } else if (m.t === 'quitte' || m.t === 'exclu') {
        this.termine(m.t);
        return;
      }
      this.onCtrl(m);
    };
    l.onJeu = (d) => {
      this.veille?.recuJeu();
      this.onJeu(d);
    };
    l.onFerme = () => this.termine('perdu');
    this.veille = new Veille(l, () => l.ferme());
    l.envoieCtrl(bonjour(nom, equipe, appareil, spect, jeton));
    // la liaison directe est établie : plus besoin des serveurs de découverte
    annuaire.ferme();
    this.annuaire = null;
    this.onChange();
  }

  /** Demande à l'hôte d'appliquer une action sur ses propres choix. */
  agit(x: ActionLan): void {
    this.liaison?.envoieCtrl({ t: 'action', x } satisfies MsgCtrl);
  }

  /** Envoie l'intention de cette image à l'hôte (à appeler à chaque image pendant un match). */
  envoieEntree(intent: InputIntent): void {
    if (this.liaison && this.siege !== null) this.liaison.envoieJeu(this.emetteur.encode(intent));
  }

  /** Réaction (l'hôte la relaie à tout le monde, avec notre nom). */
  reagit(r: Reaction): void {
    this.liaison?.envoieCtrl({ t: 'reaction', r, de: '' } satisfies MsgCtrl);
  }

  private termine(raison: RaisonFin): void {
    const l = this.liaison;
    if (!l) return;
    this.liaison = null;
    l.onFerme = () => {};
    l.ferme();
    this.veille?.arrete();
    this.veille = null;
    if (raison === 'perdu' && this.peutRevenir()) void this.reviens();
    else this.onFin(raison);
  }

  /** Une coupure en pleine partie (hors salle d'attente) laisse le temps de revenir ; un spectateur, lui, rouvre la liste. */
  private peutRevenir(): boolean {
    const e = this.partie;
    return this.siege !== null && !!this.rejointe && !!this.identite && !!e && e.phase !== 'attente';
  }

  /**
   * Reconnexion après une coupure : on relance la découverte, on attend
   * l'annonce de notre hôte (toujours là, place gardée) et on se reconnecte
   * avec notre jeton. On réessaie jusqu'au délai ; au-delà, la partie est perdue.
   */
  private async reviens(): Promise<void> {
    const gen = ++this.generationReconnexion;
    const limite = performance.now() + delaiReconnexion() * 1000;
    this.reconnexion = { limite };
    this.onChange();
    const actif = () => gen === this.generationReconnexion && this.reconnexion !== null;
    let cible: AnnoncePartie | null = null;
    while (actif()) {
      if (performance.now() > limite) {
        this.abandonneReconnexion();
        return;
      }
      try {
        if (!this.annuaire) {
          const a = new Annuaire(await salonsDuReseau(), courtiers(), false);
          await a.ouvre();
          if (!actif()) {
            a.ferme();
            return;
          }
          this.annuaire = a;
          a.onSignal = (_de, _salon, sig) => this.attenteReponse?.(sig);
          a.onAnnonce = (x) => {
            if (x.id === this.rejointe?.id) cible = x;
          };
          a.ecouteAnnonces();
        }
        if (cible) {
          await this.connecte(cible);
          if (!actif()) return;
          this.reconnexion = null;
          this.onChange();
          return;
        }
      } catch {
        // réseau pas encore revenu, hôte pas encore prêt : on réessaie
      }
      await attente(1000);
    }
  }

  private abandonneReconnexion(): void {
    this.generationReconnexion++;
    this.reconnexion = null;
    this.annuaire?.ferme();
    this.annuaire = null;
    this.onFin('perdu');
  }

  ferme(): void {
    this.generationReconnexion++;
    this.reconnexion = null;
    clearInterval(this.nettoyage);
    const l = this.liaison;
    if (l) {
      l.envoieCtrl({ t: 'quitte' } satisfies MsgCtrl);
      l.onFerme = () => {};
      setTimeout(() => l.ferme(), 150);
    }
    this.liaison = null;
    this.veille?.arrete();
    this.annuaire?.ferme();
    this.annuaire = null;
  }
}
