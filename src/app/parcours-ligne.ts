import { attente, genereCode, lienInvitation, normaliseCode } from '@piascwal/lan-kit';
import { CANAL_LOCAL } from '@net/canal';
import type { EtatLigne, EtatMulti } from '@render/index';
import type { GameApp } from './game-app';
import type { ParcoursLan } from './parcours-lan';
import { partageLien } from './partage';
import { saisitPseudo } from './pseudo';
import { ouvreSaisie } from './saisie';

/** Temps laissé à la recherche d'un salon avant de conclure qu'il n'existe pas (ms). */
const RECHERCHE_MAX_MS = 9000;

/**
 * Le parcours « multijoueur » avant la salle d'attente : choisir entre le Wi-Fi et
 * Internet, puis, en ligne, créer un salon (son code s'affiche dans la salle) ou
 * rejoindre celui d'un ami par son code ou son lien. Le reste (réglages de l'hôte,
 * salle, match, reconnexion) est celui du Wi-Fi : `ParcoursLan`.
 */
export class ParcoursLigne {
  /** Le code d'un lien d'invitation, en attente d'un geste pour rejoindre. */
  invitation: string | null = null;
  /** Le lien d'invitation vient d'être partagé (le bouton le confirme un instant). */
  copie = false;

  constructor(
    private readonly app: GameApp,
    private readonly lan: ParcoursLan,
  ) {}

  /** Menu → choix entre le Wi-Fi et Internet. */
  ouvreChoix(): void {
    this.app.audio.init();
    this.app.ecranUI = 'multi';
  }

  /** Choix « en ligne », ou retour à l'accueil en ligne (avec le message qui explique pourquoi). */
  accueil(message: string | null = null): void {
    const app = this.app;
    this.lan.ferme();
    app.creeDemo();
    app.effets.reinitialise();
    app.enPause = false;
    this.lan.canal = { type: 'ligne', code: '' };
    this.lan.statut = 'pret';
    this.lan.message = message;
    app.ecranUI = 'lanLigne';
  }

  /** Un lien d'invitation a ouvert le jeu : on propose de rejoindre son salon. */
  surInvitation(code: string): void {
    this.invitation = code;
    this.accueil();
  }

  /** Retour : à la recherche en cours on renonce, sinon on revient au choix du mode. */
  retour(): void {
    this.lan.quitte();
    if (this.lan.statut === 'pret' || this.lan.statut === 'erreur') this.ouvreChoix();
  }

  /** CREER UN SALON : l'hôte règle d'abord son match, le code est tiré pour l'occasion. */
  cree(): void {
    this.invitation = null;
    this.lan.canal = { type: 'ligne', code: genereCode() };
    this.lan.ouvreConfig();
  }

  /** Demande le code d'un salon puis le rejoint. */
  saisitCode(): void {
    ouvreSaisie({
      titre: 'CODE DU SALON',
      valeur: '',
      max: 9,
      filtre: (t) => t.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      valide: normaliseCode,
      erreur: 'CODE INVALIDE (8 CARACTERES)',
      surValide: (code) => this.rejoint(code),
    });
  }

  rejointInvitation(): void {
    if (this.invitation) this.rejoint(this.invitation);
  }

  /** Cherche le salon de ce code et y entre. */
  rejoint(code: string): void {
    this.invitation = null;
    this.lan.ouvreSession(null, { type: 'ligne', code });
    this.lan.statut = 'recherche';
    void this.attendSalon();
  }

  /** L'hôte s'annonce sur les serveurs de découverte : on attend de le voir, puis on le rejoint. */
  private async attendSalon(): Promise<void> {
    const lan = this.lan;
    const debut = performance.now();
    while (performance.now() - debut < RECHERCHE_MAX_MS) {
      if (this.app.ecranUI !== 'lanLigne' || lan.statut === 'erreur') return;
      const partie = lan.client?.parties[0];
      if (partie && lan.client) {
        lan.statut = 'pret';
        return lan.rejoins(partie);
      }
      await attente(250);
    }
    if (this.app.ecranUI === 'lanLigne') {
      lan.statut = 'pret';
      lan.message = 'SALON INTROUVABLE : VERIFIEZ LE CODE';
    }
  }

  /** Partage le lien d'invitation du salon en cours. */
  partage(code: string): void {
    const lien = lienInvitation(location.href, code);
    void partageLien(lien, `REJOINS MON SALON FACE-OFF : ${code}`).then((ok) => {
      this.copie = ok;
      setTimeout(() => (this.copie = false), 2500);
    });
  }

  vueMulti(): EtatMulti {
    return {
      pseudo: this.app.pref.pseudo,
      onLigne: () => this.accueil(),
      onLocal: () => {
        this.lan.canal = CANAL_LOCAL;
        this.lan.ouvreSession(null, CANAL_LOCAL);
      },
      onPseudo: () => saisitPseudo(this.app.pref),
      onRetour: () => this.app.retourMenu(),
    };
  }

  vueLigne(): EtatLigne {
    const l = this.lan;
    return {
      statut: l.statut,
      message: l.message,
      pseudo: this.app.pref.pseudo,
      invitation: this.invitation,
      onCree: () => this.cree(),
      onRejoint: () => this.saisitCode(),
      onInvitation: () => this.rejointInvitation(),
      onPseudo: () => saisitPseudo(this.app.pref),
      onRetour: () => this.retour(),
    };
  }
}
