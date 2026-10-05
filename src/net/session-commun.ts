import { RECONNEXION_S } from './partie';

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

/** Une réaction au plus toutes les 0,4 s par appareil (anti-matraquage). */
export const REACTION_MIN_MS = 400;

/**
 * Options de développement (jamais actives en production) : réseau et
 * serveur de découverte locaux, délai de reconnexion raccourci (tests).
 */
export function reglagesDev(): {
  reseau: string | null;
  courtiers: string[] | null;
  reconnexionS: number | null;
} {
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

export { attente } from '@piascwal/lan-kit';

/** Candidats ICE limités aux plages privées ; relâché en développement (`?reseau=`), pour les tests. */
export function plageStricte(): boolean {
  return !reglagesDev().reseau;
}
