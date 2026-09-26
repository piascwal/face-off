// Sprites « de profil » des patineurs et gardiens, à partir d'un joueur de
// référence dessiné à la main (assets/sprites-src/joueur-reference.png).
//
// Chaque couleur de la référence a un *rôle* (maillot, ombre du maillot,
// bandes, casque, gants, peau...) : on recolore ce rôle avec les couleurs de
// chaque équipe et de chaque maillot. Le haut du corps (casque → culotte) est
// repris tel quel ; les deux jambes sont redessinées à chaque image du cycle
// de patinage à partir de points (hanche, genou, cheville), pour qu'il y ait
// toujours exactement deux jambes, celle du fond un ton plus sombre. La crosse
// n'est pas dans le sprite : le jeu la trace lui-même (elle suit le palet et
// s'arme au tir) ; un calque « gants » repasse par-dessus le manche.
import { createCanvas } from '@napi-rs/canvas';

/** Couleur exacte de la référence → rôle. Toute autre couleur est refusée. */
const ROLES = {
  '#14162c': 'K', '#1c1d32': 'T', '#272a3e': 'k', '#34364a': 'n', '#777887': 'm',
  '#b83b4f': 'R', '#812445': 'r', '#591632': 'd', '#4a0e2b': 'e',
  '#f9f8f8': 'W', '#c9c9d7': 'w', '#a5a5b1': 'g', '#90929e': 'G',
  '#f6cdc2': 'S', '#9c6c63': 'B', '#665053': 'h',
};

/** Grille de rôles de la référence, recadrée sur ses pixels opaques. */
export function lisReference(img) {
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (d[(y * img.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const lignes = [];
  const inconnues = new Set();
  for (let y = y0; y <= y1; y++) {
    let l = '';
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      if (d[i + 3] <= 128) { l += '.'; continue; }
      const h = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      if (!ROLES[h]) inconnues.add(h);
      l += ROLES[h] ?? '.';
    }
    lignes.push(l);
  }
  if (inconnues.size) throw new Error(`couleurs sans rôle dans la référence : ${[...inconnues].join(', ')}`);
  return lignes;
}

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (c) => { const [r, g, b] = hex(c); return 0.299 * r + 0.587 * g + 0.114 * b; };
export function nuance(c, t) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t);
  return '#' + [f(r), f(g), f(b)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** Couleurs de chaque rôle pour une équipe, selon la zone du sprite. */
function palette(t) {
  const casque = lum(t.casque) < 60 ? nuance(t.casque, 0.2) : t.casque;
  const clairMaillot = lum(t.maillot) > 200;
  const maillot = lum(t.maillot) < 50 ? nuance(t.maillot, 0.14) : t.maillot;
  const fonce = lum(t.fonce) < 40 ? nuance(t.fonce, 0.12) : t.fonce;
  const ombre = clairMaillot ? [-0.16, -0.3, -0.42] : [-0.3, -0.5, -0.62];
  const bandes = { W: t.clair, w: nuance(t.clair, -0.12), g: nuance(t.clair, -0.25), G: nuance(t.clair, -0.35) };
  return {
    commun: {
      K: '#14162c', T: '#1c1d32', k: fonce, n: nuance(fonce, 0.22), m: '#777887',
      R: maillot, r: nuance(maillot, ombre[0]), d: nuance(maillot, ombre[1]), e: nuance(maillot, ombre[2]), S: '#f6cdc2',
      b: '#c9ccd8', o: '#8f93a3',
    },
    casque: { W: casque, w: nuance(casque, -0.14), g: nuance(casque, -0.28), G: nuance(casque, -0.38), m: nuance(casque, -0.5), B: '#c98f7c', h: '#665053' },
    maillot: { ...bandes, B: '#9c6c63', h: '#665053' },
  };
}
// la référence : casque et visage au-dessus de la ligne 13 (sur 56)
const zone = (y, h) => (y < (13 / 56) * h ? 'casque' : 'maillot');

// ------------------------------------------------------------ patineur rig --

export const JOUEUR = { W: 58, H: 60, DX: 8 };
const { W, H, DX } = JOUEUR;
/** Points d'ancrage dans une image : pieds (sur la glace) et gants (départ du manche). */
export const ANCRES = { pied: { x: DX + 17, y: 57 }, gants: { x: DX + 29, y: 29 } };

const PATIN = [
  '.KKKKK......',
  '.KnnnnK.....',
  '.KnnnWnK....',
  'KnnnnnWnKK..',
  'KnnnnnnnnnK.',
  'KKKKKKKKKKKK',
  '.obbbbbbbbbo',
];

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return { d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)), t, cote: (px - ax) * dy - (py - ay) * dx };
}

function jambe(grille, hanche, genou, cheville, inclinaison, fond) {
  const calque = Array.from({ length: H }, () => Array(W).fill(null));
  const larg = 3.1;
  const L1 = Math.hypot(genou[0] - hanche[0], genou[1] - hanche[1]);
  const L2 = Math.hypot(cheville[0] - genou[0], cheville[1] - genou[1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = distSeg(x + 0.5, y + 0.5, ...hanche, ...genou);
    const b = distSeg(x + 0.5, y + 0.5, ...genou, ...cheville);
    const s = a.d <= b.d ? { ...a, u: (a.t * L1) / (L1 + L2) } : { ...b, u: (L1 + b.t * L2) / (L1 + L2) };
    if (s.d > larg) continue;
    // bande blanche à mi-tibia, ombre à l'arrière de la jambe
    let c = s.u > 0.55 && s.u < 0.72 ? 'W' : 'R';
    if (s.cote > 0.8) c = c === 'W' ? 'g' : 'r';
    calque[y][x] = c;
  }
  PATIN.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const x = Math.round(cheville[0]) - 3 + i;
    const y = Math.round(cheville[1]) + j + Math.round(i * inclinaison);
    if (x >= 0 && x < W && y >= 0 && y < H) calque[y][x] = ch;
  }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (calque[y][x]) continue;
    const bord = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const c = calque[y + dy]?.[x + dx];
      return c && c !== 'K' && c !== 'b' && c !== 'o';
    });
    if (bord && y > 38) calque[y][x] = 'K';
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = calque[y][x];
    if (!c) continue;
    // jambe du fond : un ton plus sombre
    grille[y][x] = fond ? ({ R: 'r', r: 'e', n: 'k', W: 'w' }[c] ?? c) : c;
  }
}

const hF = (b) => [DX + 16, 39 + b];
const hD = (b) => [DX + 19, 39 + b];
const POSES = {
  repos: (b) => [[hF(b), [DX + 15, 46], [DX + 14, 51], 0], [hD(b), [DX + 21, 46], [DX + 19, 51], 0]],
  pousseFond: (b) => [[hF(b), [DX + 13, 46], [DX + 6, 51], 0.15], [hD(b), [DX + 22, 46], [DX + 19, 52], 0]],
  pousseDevant: (b) => [[hF(b), [DX + 19, 46], [DX + 16, 52], 0], [hD(b), [DX + 15, 46], [DX + 8, 51], 0.15]],
  retourFond: (b) => [[hF(b), [DX + 15, 45], [DX + 11, 50], 0.08], [hD(b), [DX + 21, 46], [DX + 19, 51], 0]],
  retourDevant: (b) => [[hF(b), [DX + 17, 46], [DX + 15, 51], 0], [hD(b), [DX + 17, 45], [DX + 13, 50], 0.08]],
};
/** Cycle de patinage : appui, poussée d'une jambe, retour, appui, poussée de l'autre, retour. */
export const BOB = [0, 1, 1, 0, 0, 1, 1, 0];
const CYCLE = ['repos', 'pousseFond', 'pousseFond', 'retourFond', 'repos', 'pousseDevant', 'pousseDevant', 'retourDevant'];

/** Haut du corps (casque → culotte) de la référence, crosse effacée là où elle traversait la culotte. */
function hautDuCorps(ref) {
  const haut = ref.slice(0, 40).map((l) => [...l]);
  const efface = { 31: [[18, 'n']], 32: [[18, 'n']], 33: [[18, 'n']], 37: [[16, 'K']], 38: [[15, 'k'], [16, 'k'], [17, 'k']], 39: [[15, 'k'], [16, 'k']] };
  for (const [y, l] of Object.entries(efface)) for (const [x, c] of l) if (haut[+y]?.[x] !== undefined) haut[+y][x] = c;
  return haut;
}

function grilleImage(haut, f) {
  const grille = Array.from({ length: H }, () => Array(W).fill('.'));
  const b = BOB[f];
  const [fond, devant] = POSES[CYCLE[f]](b);
  jambe(grille, ...fond, true);
  jambe(grille, ...devant, false);
  haut.forEach((row, y) => row.forEach((ch, x) => { if (ch !== '.' && y + b < H) grille[y + b][x + DX] = ch; }));
  return grille;
}

function peint(ctx, grille, pal, ox, oy, miroir, filtre = () => true) {
  grille.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.' || !filtre(x, y)) return;
    const c = (y < 40 ? pal[zone(y, 56)][ch] : pal.maillot[ch]) ?? pal.commun[ch];
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(ox + (miroir ? W - 1 - x : x), oy + y, 1, 1);
  }));
}

/**
 * Feuille d'un patineur : 8 colonnes (cycle), 4 rangées :
 * 0 corps vers la droite, 1 corps vers la gauche, 2 et 3 le calque des gants
 * (à redessiner par-dessus le manche de la crosse).
 */
export function feuilleJoueur(ref, equipe) {
  const pal = palette(equipe);
  const haut = hautDuCorps(ref);
  const canvas = createCanvas(W * CYCLE.length, H * 4);
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < CYCLE.length; f++) {
    const grille = grilleImage(haut, f);
    const gants = (x, y) => y >= 21 + BOB[f] && y <= 31 + BOB[f] && x >= DX + 26;
    peint(ctx, grille, pal, f * W, 0, false);
    peint(ctx, grille, pal, f * W, H, true);
    peint(ctx, grille, pal, f * W, 2 * H, false, gants);
    peint(ctx, grille, pal, f * W, 3 * H, true, gants);
  }
  return canvas;
}
export const IMAGES_JOUEUR = CYCLE.length;

// ----------------------------------------------------------------- gardien --

export const GARDIEN = { W: 40, H: 43, pied: { x: 16, y: 41 } };
const DESSIN_GARDIEN = [
  '...............KKKKKK...................',
  '.............KKWWWWWWKK.................',
  '............KWWWWWWWWWWK................',
  '...........KWWwwWWWWWWWWK...............',
  '...........KWwQQQQWWWWWWK...............',
  '...........KWwWWWWWWWKKKKK..............',
  '...........KwwWWWWWKTgTgTgK.............',
  '...........KwwWWWWKSKgTgTgK.............',
  '............KwwWWWKTgTgTgK..............',
  '............KKwwwKTgTgTgK...............',
  '.............KKKKKTgTgKK................',
  '.........KKKKKrrKKKKKK..................',
  '.......KKrRRRWWWWWRRRRKK................',
  '......KrRRRRRWWWWRRRRRRRK...............',
  '.....KrRRRRRRRRRRRRRRRRRRK..............',
  '..KKKrRRRRRRRRRRRRRRRRRRRdK.............',
  '.KYYYKRRRRRRRRRRRRRRRRRRRdK.............',
  'KYyyYYKRRWWWWRRRRRRRRRRRdRK.............',
  'KYyKKyYKRRRRRRRRRRRRRRRdRRRK............',
  'KYyKyyYKRRRRRRRRRRRRRRdRRKKKKK..........',
  'KYYyyYYKrRRRRRRRRRRRRdRKXXXXXXK.........',
  '.KYYYYKKrRRRRRRRRRRRdRKXxxxxxXXK........',
  '..KKKKKrRRRWWWWRRRRdRKXxXXXXXxXK........',
  '......KrRRRRRRRRRRdRRKXxXXXXXxXK........',
  '......KKrRRRRRRRRdRRRKXxxxxxxxXK........',
  '.......KKKKKKKKKKKKKKKKXXXXXXXK.........',
  '......KPPPPPPPKKPPPPPPPPKKKKKK..........',
  '.....KPpQQQQPPKKPQQQQQQPPK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '.....KPppppppPKKpppppppppK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '.....KPppppppPKKpppppppppK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '.....KPpQQQQPPKKPQQQQQQPPK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '.....KPppppppPKKpppppppppK..............',
  '.....KPpPPPPPPKKPPPPPPPPPK..............',
  '....KPpPPPPPPPKKPPPPPPPPPPK.............',
  '...KPpPPPPPPPPKKPPPPPPPPPPPK............',
  '..KPppppppppPK.KpppppppppppPK...........',
  '..KKKKKKKKKKKK.KKKKKKKKKKKKKK...........',
  '...ggggggggg....gggggggggggg............',
];

function peintGardien(ctx, equipe, ox, oy, miroir) {
  const pal = palette(equipe);
  const extra = {
    P: '#f2f3f7', p: '#c3c7d6', Q: equipe.maillot === '#ffffff' ? equipe.clair : equipe.maillot,
    X: nuance(equipe.fonce, 0.1), x: nuance(equipe.fonce, 0.3), Y: nuance(equipe.fonce, 0.15), y: nuance(equipe.fonce, 0.35),
  };
  const P = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + (miroir ? GARDIEN.W - 1 - x : x), oy + y, 1, 1); };
  DESSIN_GARDIEN.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const c = extra[ch] ?? pal[y < 10 ? 'casque' : 'maillot'][ch] ?? pal.commun[ch];
    if (c) P(x, y, c);
  }));
  // crosse de gardien : manche sous le bloqueur, palette large, lame sur la glace
  for (let y = 26; y <= 31; y++) { P(27, y, '#14162c'); P(28, y, '#a0714a'); P(29, y, '#6e4a2f'); P(30, y, '#14162c'); }
  for (let y = 32; y <= 39; y++) for (let x = 26; x <= 31; x++) P(x, y, x === 26 || x === 31 ? '#14162c' : x === 27 ? '#3a3d55' : '#1c1d32');
  for (let x = 26; x <= 37; x++) { P(x, 40, '#1c1d32'); P(x, 41, '#14162c'); }
  P(38, 40, '#14162c');
}

/** Feuille d'un gardien : rangée 0 tourné vers la droite, rangée 1 vers la gauche. */
export function feuilleGardien(equipe) {
  const canvas = createCanvas(GARDIEN.W, GARDIEN.H * 2);
  const ctx = canvas.getContext('2d');
  peintGardien(ctx, equipe, 0, 0, false);
  peintGardien(ctx, equipe, 0, GARDIEN.H, true);
  return canvas;
}
