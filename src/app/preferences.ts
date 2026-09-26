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
};

export function chargePreferences(): Preferences {
  const pref = { ...DEFAUT };
  try {
    Object.assign(pref, JSON.parse(localStorage.getItem(CLE) ?? '{}'));
  } catch {
    /* stockage indisponible */
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
