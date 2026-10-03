/** Session d'un joueur ou d'un spectateur qui rejoint la partie d'un hôte. */

import { Annuaire, type AnnoncePartie, type Signal } from './annuaire';
import { Liaison } from './liaison';
import { type InputIntent } from '@core/types';
import {
roleDe,
siegeDeAppareil, type ActionLan, type EtatPartieLan,
type Reaction,
type Role,
type Siege
} from './partie';
import { bonjour, EmetteurEntrees, lisCtrl, type MsgCtrl } from './protocole';
import { idAleatoire, VERSION_PROTOCOLE } from './reseau-local';
import { attente, courtiers, delaiReconnexion, ipsDuReseau, plageStricte, salonsDuReseau, Veille, type RaisonFin } from './session-commun';

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
    return !!this.rejointe && this.siege === null;
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
    const l = new Liaison(plageStricte(), ipsDuReseau());
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
