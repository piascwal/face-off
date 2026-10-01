import { DEF_POUVOIRS, POUVOIRS } from '@core/pouvoirs';
import type { PouvoirId } from '@core/types';
import { dessineIconeBonus } from './icones-bonus';
import { texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';
import { bouton, type ZoneBouton } from './widgets';

export interface EtatEntrainement {
  choix: PouvoirId;
  onChoix: (id: PouvoirId) => void;
  onJouer: () => void;
  onRetour: () => void;
}

/** Colonnes de la grille des bonus de l'écran d'entraînement. */
export const COLONNES_ENTRAINEMENT = 7;

/**
 * Mode entraînement (réglages avancés) : on choisit un bonus dans la grille
 * des bonus, il revient sans cesse pendant un match sans chrono.
 */
export function dessineEntrainement(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatEntrainement): void {
  g.fillStyle = 'rgba(7,9,20,0.86)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'ENTRAINEMENT LIBRE', cx, 4, C.blanc, 1, 'c');
  texte(g, 'CHOISISSEZ UN BONUS : IL REVIENT A CHAQUE FOIS', cx, 14, '#6f7aa6', 1, 'c');
  const cw = Math.min(68, Math.floor((W - 12) / COLONNES_ENTRAINEMENT));
  const ch = 48;
  const x0 = Math.round(cx - (cw * COLONNES_ENTRAINEMENT) / 2);
  const y0 = 28;
  POUVOIRS.forEach((id, i) => {
    const x = x0 + (i % COLONNES_ENTRAINEMENT) * cw;
    const y = y0 + Math.floor(i / COLONNES_ENTRAINEMENT) * (ch + 4);
    const choisi = id === etat.choix;
    const cl = choisi ? (Math.floor(temps * 4) % 2 ? C.blanc : C.or) : '#2a3160';
    px(g, x + 2, y, cw - 4, ch, cl);
    px(g, x + 3, y + 1, cw - 6, ch - 2, choisi ? '#232a58' : '#141939');
    dessineIconeBonus(g, id, x + cw / 2, y + 17, 24);
    // nom sur deux lignes si besoin (TIR SURPUISSANT)
    const mots = DEF_POUVOIRS[id].nom.split(' ');
    const lignes = mots.length > 1 && DEF_POUVOIRS[id].nom.length > 10 ? [mots[0]!, mots.slice(1).join(' ')] : [DEF_POUVOIRS[id].nom];
    lignes.forEach((l, k) => texte(g, l, x + cw / 2, y + 33 + k * 8 - (lignes.length - 1) * 4, choisi ? C.or : C.gris, 1, 'c'));
    boutons.push({ x: x + 2, y, w: cw - 4, h: ch, act: () => etat.onChoix(id) });
  });
  const by = y0 + Math.ceil(POUVOIRS.length / COLONNES_ENTRAINEMENT) * (ch + 4) + 6;
  bouton(g, boutons, '< RETOUR', cx - 95, by, 90, 18, etat.onRetour, { couleur: '#232a58' });
  bouton(g, boutons, 'JOUER', cx + 5, by, 90, 18, etat.onJouer, { e: 2, couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
}
