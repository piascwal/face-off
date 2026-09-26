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
}

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
  if (typeof pref.pseudo !== 'string' || !/^[A-Z0-9 ]{1,14}$/.test(pref.pseudo)) {
    pref.pseudo = generePseudo();
    sauvePreferences(pref);
  }
  return pref;
}

export function sauvePreferences(pref: Preferences): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(pref));
  } catch {
    /* tant pis */
  }
}
