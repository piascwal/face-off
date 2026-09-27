import { obtientLogo } from './logos';
import { largeurTexte, texte } from './pixel-font';
import { disque, px } from './primitives';
import { C } from './theme';
import type { ZoneBouton } from './widgets';

/**
 * Réactions du mode spectateur : les deux logos des équipes du match
 * (`logo0`, `logo1`), toujours présents, puis quatre icônes pixel art.
 * L'ordre est celui de la barre de boutons (voir `REACTIONS` dans net/partie).
 */
export const CODES_REACTIONS = ['logo0', 'logo1', 'feu', 'gyro', 'coeur', 'ouf'] as const;

/** Icônes 12×12 : une lettre par couleur, « . » = transparent. */
const ICONES: Record<string, string[]> = {
  feu: [
    '....o.......',
    '...oo.......',
    '...oyo..o...',
    '..oyyo.oo...',
    '..oyyyooyo..',
    '.oyywyyyyo..',
    '.oyywwyyyyo.',
    'oyywwwwyyyo.',
    'oyywwwwwyyo.',
    'oyyywwwyyyo.',
    '.oyyyyyyyo..',
    '..oooooooo..',
  ],
  gyro: [
    '....rrrr....',
    '...rwwrrr...',
    '..rwwrrrrr..',
    '..rwrrrrrr..',
    '..rrrrrrrr..',
    '..rrrrrrrr..',
    '.kkkkkkkkkk.',
    '.kggggggggk.',
    '.kkkkkkkkkk.',
    'y..........y',
    '.y........y.',
    '............',
  ],
  coeur: [
    '............',
    '.rrr...rrr..',
    'rrwrr.rrrrr.',
    'rwrrrrrrrrr.',
    'rrrrrrrrrrr.',
    'rrrrrrrrrrr.',
    '.rrrrrrrrr..',
    '..rrrrrrr...',
    '...rrrrr....',
    '....rrr.....',
    '.....r......',
    '............',
  ],
  ouf: [
    '............',
    'wwww.w..w.ww',
    'w..w.w..w.w.',
    'w..w.w..w.ww',
    'w..w.w..w.w.',
    'wwww.wwww.w.',
    '............',
    '..yyyyyyyy..',
    '..y......y..',
    '..yyyyyyyy..',
    '............',
    '............',
  ],
};
const COULEURS: Record<string, string> = { o: '#e65a14', y: '#ffcd3c', w: '#ffffff', r: '#e12832', k: '#282832', g: '#8c8c96' };

/**
 * Dessine une réaction centrée en (x, y), dans un carré de `taille` px.
 * `logos` : id des écussons des deux équipes du match.
 */
export function dessineIconeReaction(g: CanvasRenderingContext2D, r: string, x: number, y: number, taille: number, logos: [string, string]): void {
  if (r === 'logo0' || r === 'logo1') {
    const img = obtientLogo(logos[r === 'logo0' ? 0 : 1]);
    if (!img) return;
    g.imageSmoothingEnabled = true;
    g.drawImage(img, Math.round(x - taille / 2), Math.round(y - taille / 2), taille, taille);
    g.imageSmoothingEnabled = false;
    return;
  }
  const lignes = ICONES[r];
  if (!lignes) return;
  const k = taille / 12;
  const x0 = x - taille / 2;
  const y0 = y - taille / 2;
  lignes.forEach((l, j) => {
    for (let i = 0; i < l.length; i++) {
      const c = COULEURS[l[i]!];
      if (c) px(g, x0 + i * k, y0 + j * k, Math.ceil(k), Math.ceil(k), c);
    }
  });
}

/**
 * Barre de réactions (spectateur, ou joueurs sur l'écran de fin) : six
 * pastilles rondes, centrées en `cx`, sur la ligne `y`.
 */
export function dessineBarreReactions(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  cx: number,
  y: number,
  logos: [string, string],
  onReagit: (r: string) => void,
  rayon = 11,
): void {
  const pas = rayon * 2 + 5;
  const x0 = cx - ((CODES_REACTIONS.length - 1) * pas) / 2;
  CODES_REACTIONS.forEach((r, i) => {
    const x = Math.round(x0 + i * pas);
    g.globalAlpha = 0.85;
    disque(g, x, y, rayon, C.contour);
    disque(g, x, y, rayon - 1, i < 2 ? '#232a58' : '#1c2350');
    g.globalAlpha = 1;
    dessineIconeReaction(g, r, x, y, Math.round(rayon * 1.3), logos);
    boutons.push({ x: x - rayon, y: y - rayon, w: rayon * 2, h: rayon * 2, act: () => onReagit(r) });
  });
}

export interface ReactionAffichee {
  r: string;
  de: string;
  /** Instant d'arrivée (s). */
  t0: number;
  /** Couloir (0..2) : les réactions rapprochées ne se chevauchent pas. */
  couloir: number;
}

/** Durée de vie d'une réaction à l'écran (s), et nombre maximal affichées ensemble. */
export const REACTION_VIE_S = 1.6;
export const REACTIONS_MAX = 6;

/**
 * Réactions qui montent le long du bord droit, petites et semi-transparentes
 * pour ne pas gêner le jeu, avec le nom de leur auteur.
 */
export function dessineReactions(g: CanvasRenderingContext2D, W: number, H: number, liste: ReactionAffichee[], maintenant: number, logos: [string, string]): void {
  for (const a of liste) {
    const u = (maintenant - a.t0) / REACTION_VIE_S;
    if (u < 0 || u > 1) continue;
    const x = W - 24 - a.couloir * 20 + Math.sin(u * 6 + a.couloir) * 2;
    const y = H * 0.72 - u * H * 0.45;
    const entree = Math.min(1, u * 8);
    const taille = Math.round(14 + 4 * entree);
    g.globalAlpha = 0.85 * Math.min(1, (1 - u) * 3);
    dessineIconeReaction(g, a.r, x, y, taille, logos);
    // le nom sous l'icône, sans déborder du bord droit
    const xn = Math.min(x, W - 3 - largeurTexte(a.de) / 2);
    texte(g, a.de, Math.round(xn), Math.round(y + taille / 2 + 2), C.blanc, 1, 'c');
    g.globalAlpha = 1;
  }
}
