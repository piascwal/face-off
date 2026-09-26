const CLE = 'face-off-v1';

export interface Preferences {
  niveau: number;
  duree: number;
  effectif: number;
  son: boolean;
  victoires: number[];
  matchs: number[];
  /** Dernière équipe pilotée par le joueur, pré-sélectionnée à la prochaine partie. */
  equipeJoueur: string;
  /** Réglages avancés (écran dédié depuis le menu). */
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  secoussesReduites: boolean;
  /** Surnom affiché aux autres joueurs du Wi-Fi (généré une fois, pas de saisie au clavier). */
  pseudo: string;
  /** Identifiant stable de cet appareil, pour reconnaître un adversaire d'une partie à l'autre. */
  appareil: string;
  /** Ralenti des buts (solo ; en Wi-Fi, c'est le réglage de l'hôte qui compte). */
  ralentiButs: boolean;
  /** Bilan des duels Wi-Fi, par appareil adverse. */
  duels: Record<string, BilanDuel>;
}

export interface BilanDuel {
  nom: string;
  v: number;
  d: number;
  n: number;
}

const DUELS_MAX = 50;

const DEFAUT: Preferences = {
  niveau: 1,
  duree: 1,
  effectif: 1,
  son: true,
  victoires: [0, 0, 0],
  matchs: [0, 0, 0],
  equipeJoueur: 'toulouse',
  assistTir: true,
  assistPasse: true,
  changementAuto: true,
  secoussesReduites: false,
  pseudo: '',
  appareil: '',
  ralentiButs: true,
  duels: {},
};

const SURNOMS = ['LYNX', 'ORQUE', 'AIGLE', 'LOUP', 'OURS', 'PUMA', 'FAUCON', 'BISON', 'RENARD', 'TIGRE', 'COBRA', 'HIBOU', 'REQUIN', 'ZEBRE'];

export function generePseudo(): string {
  const n = SURNOMS[Math.floor(Math.random() * SURNOMS.length)]!;
  return `${n} ${10 + Math.floor(Math.random() * 90)}`;
}

export function chargePreferences(): Preferences {
  const pref = { ...DEFAUT };
  try {
    Object.assign(pref, JSON.parse(localStorage.getItem(CLE) ?? '{}'));
  } catch {
    /* stockage indisponible */
  }
  let modifie = false;
  if (typeof pref.pseudo !== 'string' || !/^[A-Z0-9 ]{1,14}$/.test(pref.pseudo)) {
    pref.pseudo = generePseudo();
    modifie = true;
  }
  if (typeof pref.appareil !== 'string' || !/^[0-9a-f]{16}$/.test(pref.appareil)) {
    pref.appareil = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
    modifie = true;
  }
  if (!pref.duels || typeof pref.duels !== 'object') pref.duels = {};
  if (modifie) sauvePreferences(pref);
  return pref;
}

/** Enregistre l'issue d'un duel Wi-Fi (les plus anciens adversaires sont oubliés au-delà de 50). */
export function noteDuel(pref: Preferences, appareil: string, nom: string, resultat: 'v' | 'd' | 'n'): void {
  const b = pref.duels[appareil] ?? { nom, v: 0, d: 0, n: 0 };
  delete pref.duels[appareil];
  b.nom = nom;
  b[resultat]++;
  pref.duels[appareil] = b;
  const cles = Object.keys(pref.duels);
  for (const k of cles.slice(0, Math.max(0, cles.length - DUELS_MAX))) delete pref.duels[k];
  sauvePreferences(pref);
}

export function sauvePreferences(pref: Preferences): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(pref));
  } catch {
    /* tant pis */
  }
}
