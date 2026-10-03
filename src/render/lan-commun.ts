/** Écrans du multijoueur Wi-Fi : libellés, couleurs et petits outils communs. */

import type { BonusEquipe } from '@core/types';
import type { FormatLan } from '@net/partie';

/** Libellés des formats de partie (voir net/partie). */
export const LIBELLES_FORMAT: Record<FormatLan, string> = {
  '1v1': '1 CONTRE 1',
  '2v1': '2 CONTRE 1',
  '1v2': '1 CONTRE 2',
  '2v2': '2 CONTRE 2',
  coop: 'COOP CONTRE CPU',
};
export const COURT_FORMAT: Record<FormatLan, string> = { '1v1': '1V1', '2v1': '2V1', '1v2': '1V2', '2v2': '2V2', coop: 'COOP' };

export const points = (t: number) => '.'.repeat(1 + (Math.floor(t * 3) % 3));

export const oui = (b: boolean) => (b ? 'OUI' : 'NON');
export const ROUGE = { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' };
export const BLEU = { couleur: '#1f7fb3', clair: '#6fd0ff', fonce: '#0f4d73' };
export const VERT = '#5ce68a';

export interface ResumeConfig {
  format: FormatLan;
  niveauIdx: number;
  effectifIdx: number;
  dureeIdx: number;
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  ralenti: boolean;
  pouvoirs: boolean;
}

/** Libellés des handicaps (voir core BonusEquipe). */
export const LIBELLES_BONUS: Record<BonusEquipe, string> = {
  aucun: 'SANS AIDE',
  gardien: 'GARDIEN +20%',
  vitesse: 'VITESSE +10%',
  tir: 'TIR PUISSANT',
  but: "1 BUT D'AVANCE",
};
