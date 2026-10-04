/**
 * Mise à jour du jeu. Le service worker de la PWA (voir `vite.config.ts`)
 * télécharge la nouvelle version en arrière-plan quand il y en a une ; on ne
 * l'installe pas de force : on la PROPOSE. Rien n'est bloquant — hors ligne, la
 * recherche échoue en silence et le jeu reste jouable avec la version en cache ;
 * si le joueur refuse, il continue sur l'ancienne version (et la proposition
 * revient au prochain lancement, ou par le petit bouton du menu).
 */
export type EtatMiseAJour = 'aucune' | 'proposee' | 'refusee';

/** Forme d'une version publiée : `V0.12.0`, éventuellement `V0.12.0+57`. */
const VERSION_SURE = /^V\d{1,3}(\.\d{1,3}){1,3}(\+\d{1,6})?$/;

export class MiseAJour {
  etat: EtatMiseAJour = 'aucune';
  /** la version proposée, si on a pu la lire (sinon l'écran reste générique) */
  version: string | null = null;
  private installe: (() => void) | null = null;

  /** La proposition est affichée (fenêtre au-dessus du menu). */
  get proposee(): boolean {
    return this.etat === 'proposee';
  }

  /** Le joueur a dit « plus tard » : seul un petit bouton rappelle la mise à jour. */
  get refusee(): boolean {
    return this.etat === 'refusee';
  }

  /** Une version plus récente est prête ; `installe` la met en service et recharge la page. */
  signale(installe: () => void, version: string | null = null): void {
    this.installe = installe;
    this.version = version && VERSION_SURE.test(version) ? version : null;
    if (this.etat === 'aucune') this.etat = 'proposee';
  }

  accepte(): void {
    this.installe?.();
  }

  plusTard(): void {
    if (this.etat === 'proposee') this.etat = 'refusee';
  }

  /** Le petit bouton du menu rouvre la proposition. */
  rouvre(): void {
    if (this.etat === 'refusee') this.etat = 'proposee';
  }
}

/** La version publiée, lue dans `version.json` (jamais mis en cache) ; null si hors ligne ou illisible. */
export async function lisVersionPubliee(
  base: string,
  chercher: typeof fetch = fetch,
  delaiMs = 4000,
): Promise<string | null> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const r = await chercher(`${base}version.json?${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) return null;
    const o = (await r.json()) as { version?: unknown };
    return typeof o.version === 'string' && VERSION_SURE.test(o.version) ? o.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Intervalle des recherches de mise à jour pendant que le jeu reste ouvert (une app installée peut rester des jours en arrière-plan). */
export const INTERVALLE_RECHERCHE_MS = 30 * 60_000;
