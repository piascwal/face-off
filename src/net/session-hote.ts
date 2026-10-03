/** Session de l'hôte : il arbitre la partie et sert le match aux joueurs et aux spectateurs. */

import { Annuaire, type Signal } from './annuaire';
import { Liaison } from './liaison';
import { Limiteur } from './limiteur';
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
nouvellePartie, regardeurPart,
roleDe,
siegeDeAppareil,
SPECTATEURS_MAX,
versAttente,
versFin,
type ActionLan,
type ConfigLan,
type EtatPartieLan,
type Reaction, type Siege
} from './partie';
import { EntreeDistante } from './entrees';
import { lisCtrl, type MsgCtrl } from './protocole';
import { VERSION_PROTOCOLE } from './reseau-local';
import { courtiers, delaiReconnexion, ipsDuReseau, plageStricte, REACTION_MIN_MS, salonsDuReseau, Veille, type RaisonFin } from './session-commun';

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
  /** Débit autorisé sur chaque canal (anti-saturation). */
  limiteCtrl: Limiteur;
  limiteJeu: Limiteur;
  code: string | null;
}

/**
 * Débits par appareil : messages de contrôle (actions, réactions, ping),
 * et entrées de jeu (une par image affichée, jusqu'à 120 Hz).
 */
const CTRL_PAR_S = 20;
const CTRL_RAFALE = 40;
const JEU_PAR_S = 240;
const JEU_RAFALE = 480;

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
    const l = new Liaison(plageStricte(), ipsDuReseau());
    const m: Membre = { l, veille: null, nom: null, appareil: '', jeton: '', equipe: '', entree: new EntreeDistante(), code: null, limiteCtrl: new Limiteur(CTRL_PAR_S, CTRL_RAFALE), limiteJeu: new Limiteur(JEU_PAR_S, JEU_RAFALE) };
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
      if (m.limiteJeu.accepte() && m.entree.recoit(d, performance.now() / 1000)) m.veille?.recuJeu();
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
    // au-delà de son débit, un appareil est ignoré (il ne peut pas saturer l'hôte ni les autres)
    if (!m.limiteCtrl.accepte()) return;
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
