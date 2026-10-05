import { Liaison, Veille, salonEnLigne, salonsDuReseau, type Salon } from '@piascwal/lan-kit';
import { APP } from './reseau-local';
import { plageStricte, reglagesDev } from './session-commun';

/** Où se retrouvent les joueurs : sur le même Wi-Fi, ou par Internet avec le code d'un salon. */
export type Canal = { type: 'local' } | { type: 'ligne'; code: string };

export const CANAL_LOCAL: Canal = { type: 'local' };

/** Silence toléré avant de couper une liaison (ms) : plus long sur Internet, où la latence varie davantage. */
const SILENCE_LOCAL_MS = 6000;
const SILENCE_LIGNE_MS = 12_000;

/** Ce qu'il faut pour annoncer, chercher et lier des appareils sur un canal. */
export interface Reseau {
  salons: Salon[];
  /** nos adresses publiques (secours des liaisons du Wi-Fi) */
  ips: string[];
  enLigne: boolean;
}

/** Prépare un canal : détecte le Wi-Fi, ou dérive le salon du code (lève `code` s'il est invalide). */
export async function ouvreReseau(canal: Canal): Promise<Reseau> {
  if (canal.type === 'ligne')
    return { salons: [await salonEnLigne(APP, canal.code)], ips: [], enLigne: true };
  const { salons, ipsPubliques } = await salonsDuReseau(APP, reglagesDev().reseau);
  return { salons, ips: ipsPubliques, enLigne: false };
}

/** Une liaison adaptée au canal : limitée au Wi-Fi, ou ouverte à Internet. */
export const creeLiaison = (r: Reseau): Liaison => new Liaison(plageStricte(), r.ips, { enLigne: r.enLigne });

/** La veille d'une liaison, plus patiente sur Internet. */
export const creeVeille = (l: Liaison, r: Reseau, surSilence: () => void): Veille =>
  new Veille(l, surSilence, r.enLigne ? SILENCE_LIGNE_MS : SILENCE_LOCAL_MS);
