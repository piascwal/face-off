import { COURTIERS } from './courtiers';
import { Liaison } from './liaison';
import { RECONNEXION_S } from './partie';
import type { MsgCtrl } from './protocole';
import { detecteReseaux, salonPour, type Salon } from './reseau-local';

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
export const REACTION_MIN_MS = 400;

/**
 * Options de développement (jamais actives en production) : réseau et
 * serveur de découverte locaux, délai de reconnexion raccourci (tests).
 */
export function reglagesDev(): { reseau: string | null; courtiers: string[] | null; reconnexionS: number | null } {
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
export function delaiReconnexion(): number {
  return reglagesDev().reconnexionS ?? RECONNEXION_S;
}

export const attente = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nos adresses IPv4 publiques (celles de la box), vues à la détection du réseau : secours des liaisons locales. */
let ipsPubliques: string[] = [];
export const ipsDuReseau = (): string[] => ipsPubliques;

export async function salonsDuReseau(): Promise<Salon[]> {
  const dev = reglagesDev();
  const cles = dev.reseau ? [`dev:${dev.reseau}`] : await detecteReseaux();
  if (!cles.length) throw new Error('reseau');
  ipsPubliques = cles.filter((c) => c.startsWith('ip4:')).map((c) => c.slice(4));
  return Promise.all(cles.map(salonPour));
}

/** Candidats ICE limités aux plages privées ; relâché en développement (`?reseau=`), pour les tests. */
export function plageStricte(): boolean {
  return !reglagesDev().reseau;
}

export function courtiers(): string[] {
  return reglagesDev().courtiers ?? COURTIERS;
}

/** Surveille une liaison : ping/pong pour la latence, et coupure si le pair se tait trop longtemps. */
export class Veille {
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
