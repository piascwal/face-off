import { Annuaire, COURTIERS, type AnnoncePartie, type Signal } from './annuaire';
import { Liaison } from './liaison';
import type { InputIntent } from '@core/types';
import {
  appliqueAction,
  avanceReprise,
  inviteArrive,
  invitePart,
  nouvellePartie,
  versFin,
  type ActionLan,
  type ConfigLan,
  type EtatPartieLan,
} from './partie';
import { bonjour, EmetteurEntrees, EntreeDistante, lisCtrl, type MsgCtrl } from './protocole';
import { detecteReseaux, salonPour, VERSION_PROTOCOLE, type Salon } from './reseau-local';

/**
 * Sessions de jeu en réseau local : l'appareil hôte *est* le serveur.
 *
 * Découverte : l'hôte publie une annonce chiffrée dans le salon de son
 * réseau (voir reseau-local / annuaire) ; le client liste les annonces de son
 * propre réseau, choisit une partie et dépose son offre WebRTC dans la boîte
 * de l'hôte. Dès que la liaison directe est ouverte, plus rien ne passe par
 * les serveurs de découverte : le client s'en déconnecte.
 */

export type RaisonFin = 'quitte' | 'exclu' | 'perdu' | 'complet' | 'version' | 'injoignable';

const PING_MS = 1000;
const SILENCE_MAX_MS = 6000;

/** Options de développement (jamais actives en production) : réseau et serveur de découverte locaux. */
function reglagesDev(): { reseau: string | null; courtiers: string[] | null } {
  if (!import.meta.env.DEV) return { reseau: null, courtiers: null };
  const q = new URLSearchParams(location.search);
  return { reseau: q.get('reseau'), courtiers: q.get('courtier') ? [q.get('courtier')!] : null };
}

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
  equipe: string;
  config: ConfigLan;
}

export class SessionHote {
  /** État partagé de la partie ; l'hôte en est le seul arbitre. */
  readonly partie: EtatPartieLan;
  code: string | null = null;
  /** Un client est en train de se connecter (offre reçue, liaison pas encore ouverte). */
  connexionEnCours = false;
  onChange: () => void = () => {};
  /** Les deux joueurs ont validé (maillots, ou vote « rejouer ») : l'app lance le match. */
  onDebut: () => void = () => {};
  onInviteParti: (raison: RaisonFin, nom: string) => void = () => {};

  private liaison: Liaison | null = null;
  /** Entrées du joueur invité, reconstruites pas à pas (une par invité, pas par match). */
  private entree = new EntreeDistante();
  private veille: Veille | null = null;
  private ferme_ = false;

  private constructor(
    private readonly annuaire: Annuaire,
    infos: InfosHote,
    private readonly equipeConnue: (id: string) => boolean,
  ) {
    this.partie = nouvellePartie(infos.config, infos.nom, infos.equipe);
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

  get latenceMs(): number | null {
    return this.veille?.latenceMs ?? null;
  }

  get aUnInvite(): boolean {
    return this.partie.joueurs[1] !== null;
  }

  private annonce(): void {
    if (this.ferme_) return;
    const j = this.partie.joueurs[0];
    const c = this.partie.config;
    this.annuaire.annonce({ nom: j.nom, equipe: j.equipe, effectif: c.effectif, duree: c.duree });
  }

  /** Envoie l'état de la partie à l'invité et prévient l'app. */
  private diffuse(): void {
    this.liaison?.envoieCtrl({ t: 'etat', e: this.partie } satisfies MsgCtrl);
    this.onChange();
  }

  /** Applique une action de l'hôte lui-même (même règles que pour l'invité). */
  agit(action: ActionLan): void {
    const debut = appliqueAction(this.partie, 0, action, this.equipeConnue);
    this.diffuse();
    if (debut) this.onDebut();
  }

  /** Le match s'est terminé : place au vote « rejouer / changer d'équipes ». */
  finMatch(): void {
    versFin(this.partie);
    this.diffuse();
  }

  /** Fait avancer le compte à rebours de reprise après une pause. */
  avance(dt: number): void {
    if (avanceReprise(this.partie, dt)) this.diffuse();
  }

  private async surSignal(de: string, salon: number, sig: Signal): Promise<void> {
    if (sig.type !== 'offre' || this.ferme_) return;
    if (this.liaison) {
      await this.annuaire.signale(de, salon, { type: 'refus', raison: 'complet' });
      return;
    }
    const l = new Liaison();
    this.liaison = l;
    this.entree = new EntreeDistante();
    this.connexionEnCours = true;
    this.onChange();
    try {
      const sdp = await l.accepteOffre(sig.sdp);
      await this.annuaire.signale(de, salon, { type: 'reponse', sdp });
      await l.ouverte();
      this.code = await l.codeVerification();
    } catch {
      this.libere(l);
      return;
    }
    // on attend le « bonjour » du client pour connaître son nom et son équipe
    l.onCtrl = (o) => this.surCtrl(l, o);
    l.onJeu = (d) => {
      if (this.entree.recoit(d, performance.now() / 1000)) this.veille?.recuJeu();
    };
    l.onFerme = () => this.parti(l, 'perdu');
    this.veille = new Veille(l, () => l.ferme());
    // un pair qui ouvre la liaison sans jamais se présenter ne bloque pas la partie
    setTimeout(() => {
      if (this.liaison === l && !this.aUnInvite) this.libere(l);
    }, 10_000);
  }

  private surCtrl(l: Liaison, o: unknown): void {
    if (l !== this.liaison) return;
    const m = lisCtrl(o);
    if (!m || this.veille?.recu(m)) return;
    if (m.t === 'bonjour') {
      if (m.v !== VERSION_PROTOCOLE || this.aUnInvite) {
        l.ferme();
        return;
      }
      inviteArrive(this.partie, m.nom, this.equipeConnue(m.equipe) ? m.equipe : this.partie.joueurs[0].equipe);
      this.connexionEnCours = false;
      // la partie est pleine : on la retire de la liste des autres appareils
      this.annuaire.retireAnnonce();
      this.diffuse();
    } else if (m.t === 'action' && this.aUnInvite) {
      const debut = appliqueAction(this.partie, 1, m.x, this.equipeConnue);
      this.diffuse();
      if (debut) this.onDebut();
    } else if (m.t === 'quitte') {
      this.parti(l, 'quitte');
    }
  }

  private libere(l: Liaison): void {
    if (this.liaison !== l) return;
    l.onFerme = () => {};
    l.ferme();
    this.veille?.arrete();
    this.veille = null;
    this.liaison = null;
    this.code = null;
    this.connexionEnCours = false;
    invitePart(this.partie);
    this.annonce();
    this.onChange();
  }

  private parti(l: Liaison, raison: RaisonFin): void {
    if (this.liaison !== l) return;
    const invite = this.partie.joueurs[1];
    this.libere(l);
    if (invite) this.onInviteParti(raison, invite.nom);
  }

  /** Intention du joueur invité pour le prochain pas de simulation. */
  entreeInvite(maintenant: number): InputIntent {
    return this.entree.prochain(maintenant);
  }

  exclut(): void {
    const l = this.liaison;
    if (!l || !this.aUnInvite) return;
    l.envoieCtrl({ t: 'exclu' } satisfies MsgCtrl);
    l.onCtrl = () => {};
    invitePart(this.partie);
    this.onChange();
    // laisse partir le message avant de couper
    setTimeout(() => this.libere(l), 150);
  }

  envoieCtrl(m: MsgCtrl): void {
    this.liaison?.envoieCtrl(m);
  }

  envoieJeu(data: ArrayBuffer): void {
    this.liaison?.envoieJeu(data);
  }

  ferme(): void {
    if (this.ferme_) return;
    this.ferme_ = true;
    const l = this.liaison;
    if (l) {
      l.envoieCtrl({ t: 'quitte' } satisfies MsgCtrl);
      l.onFerme = () => {};
      setTimeout(() => l.ferme(), 150);
    }
    this.veille?.arrete();
    this.liaison = null;
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

  async rejoins(partie: AnnoncePartie, nom: string, equipe: string): Promise<void> {
    const annuaire = this.annuaire;
    if (!annuaire || this.liaison) return;
    if (partie.v !== VERSION_PROTOCOLE) throw new Error('version');
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
      await annuaire.signale(partie.id, partie.salon, { type: 'offre', sdp, nom });
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
    l.envoieCtrl(bonjour(nom, equipe));
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
    if (this.liaison) this.liaison.envoieJeu(this.emetteur.encode(intent));
  }

  private termine(raison: RaisonFin): void {
    const l = this.liaison;
    if (!l) return;
    this.liaison = null;
    l.onFerme = () => {};
    l.ferme();
    this.veille?.arrete();
    this.veille = null;
    this.onFin(raison);
  }

  ferme(): void {
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
