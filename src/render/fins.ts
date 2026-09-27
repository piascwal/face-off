import REFERENCES from './fins-reference.json';
import type { Palette } from './team-visuals';

/**
 * Images de victoire et de défaite aux couleurs de l'équipe du joueur : même
 * principe que les sprites (scripts/sprites-illustres.mjs). Chaque pixel de
 * maillot, de bande ou d'empiècement prend la couleur de l'équipe, assombrie
 * ou éclaircie comme l'était la couleur d'origine par rapport à la couleur
 * de référence de son rôle (src/render/fins-reference.json). Les rôles
 * viennent de public/fins/<image>-roles.png (voir scripts/roles-fins.py) :
 * les lignes de la glace, la cage, la foule gardent leurs couleurs.
 */

export type ImageFin = 'victoire' | 'defaite';

const hex = (s: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
const lum = (c: ArrayLike<number>) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Repeint une couleur : même rapport de luminosité à la référence, appliqué à la cible. */
function teinte(r0: number, g0: number, b0: number, base: number, cible: [number, number, number], out: Uint8ClampedArray, i: number): void {
  const r = borne(lum([r0, g0, b0]) / base, 0.15, 1.8);
  const lc = lum(cible);
  for (let k = 0; k < 3; k++) {
    const c = cible[k]!;
    let v = r <= 1 ? c * r ** 0.9 : c + (255 - c) * borne((r - 1) * 0.9, 0, 1);
    // une cible presque noire garde un peu de relief dans les reflets
    if (lc < 50 && r > 0.85) v = Math.max(v, 25 + c * 0.4 + (r - 0.85) * 120);
    out[i + k] = v;
  }
}

/**
 * Renvoie l'image repeinte (un canvas de la taille de l'image), ou null si
 * l'image ou sa carte de rôles ne sont pas encore chargées.
 */
export function repeintImageFin(nom: ImageFin, img: HTMLImageElement, roles: HTMLImageElement, p: Palette): HTMLCanvasElement | null {
  if (!img.complete || !img.naturalWidth || !roles.complete || roles.naturalWidth !== img.naturalWidth) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(roles, 0, 0);
  const carte = g.getImageData(0, 0, w, h).data;
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, w, h);
  const d = image.data;
  const ref = REFERENCES[nom];
  // rôle (valeur de la carte : 85, 170, 255) -> luminosité de référence et couleur cible
  const cibles: [number, [number, number, number]][] = [
    [lum(ref.maillot), hex(p.maillot)],
    [lum(ref.bande), hex(p.fonce)],
    [lum(ref.blanc), hex(p.clair)],
  ];
  for (let i = 0; i < d.length; i += 4) {
    const role = Math.round(carte[i]! / 85);
    if (role < 1 || role > 3) continue;
    const [base, cible] = cibles[role - 1]!;
    teinte(d[i]!, d[i + 1]!, d[i + 2]!, base, cible, d, i);
  }
  g.putImageData(image, 0, 0);
  return c;
}
