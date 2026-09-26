// Joueurs et gardiens « illustrés » : les dessins pixel art convertis par
// convertit-sources.py (assets/sprites-src/joueur.png, gardien.png) sont
// repeints aux couleurs de chaque équipe grâce à leur carte de rôles
// (*-roles.png : un rôle par pixel, voir sprites.json). Les ombres et les
// reflets du dessin sont gardés : chaque pixel prend la couleur de l'équipe,
// assombrie ou éclaircie comme l'était la couleur d'origine.
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

/** Couleurs de référence du dessin d'origine (maillot rouge, bandes or, empiècements crème). */
const REF = {
  maillot: hex('#c11818'),
  casque: hex('#c11818'),
  bande: hex('#f2b23a'),
  'casque-bande': hex('#f2b23a'),
  blanc: hex('#f6efd9'),
  gants: hex('#8d4d2e'),
};

/** Repeint un pixel : même rapport de luminosité à la couleur de référence, appliqué à la cible. */
function teinte(px, base, cible) {
  const r = borne(lum(px) / lum(base), 0.15, 1.8);
  let out = cible.map((c) => (r <= 1 ? c * r ** 0.9 : c + (255 - c) * borne((r - 1) * 0.9, 0, 1)));
  // une cible presque noire garde un peu de relief dans les reflets
  if (lum(cible) < 50 && r > 0.85) out = out.map((c, i) => Math.max(c, 25 + cible[i] * 0.4 + (r - 0.85) * 120));
  return out.map((c) => Math.round(borne(c, 0, 255)));
}

/** Contour : le fond magenta déteint dans les traits sombres, on les neutralise. */
const contour = (px) => {
  const v = Math.max(...px) / 255;
  return [22, 16, 26].map((c) => Math.round(borne(c * (0.6 + v * 2), 0, 255)));
};

/**
 * Variantes de visage (teint, barbe) : la première est le dessin d'origine.
 * Elles sont indépendantes de l'équipe, dessinées dans un calque à part.
 */
export const VISAGES = [
  null,
  { peau: '#f0c3a4', barbe: '#c79a52' },
  { peau: '#8a5a3c', barbe: '#1d1716' },
  { peau: '#d29b74', barbe: '#9c3f1c' },
  { peau: '#5e3b27', barbe: '#161212' },
  { peau: '#eab596', barbe: '#8a8480' },
];

export async function chargeSources(dossier) {
  const meta = JSON.parse(readFileSync(path.join(dossier, 'sprites.json'), 'utf8'));
  const lis = async (nom) => {
    const img = await loadImage(path.join(dossier, nom));
    const c = createCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, img.width, img.height);
  };
  return {
    meta,
    joueur: await lis('joueur.png'),
    joueurRoles: await lis('joueur-roles.png'),
    gardien: await lis('gardien.png'),
    gardienRoles: await lis('gardien-roles.png'),
  };
}

/** Couleur la plus fréquente d'un rôle : la base des variantes de visage. */
function couleurDominante(img, roles, role) {
  const n = new Map();
  for (let i = 0; i < roles.data.length; i += 4) {
    if (roles.data[i] !== role || img.data[i + 3] === 0) continue;
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  const [k] = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return [(k >> 16) & 255, (k >> 8) & 255, k & 255];
}

/** Boîte de chaque zone d'écusson, case par case. */
function zonesEcusson(roles, tileW, nb, role) {
  const zones = [];
  for (let t = 0; t < nb; t++) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < roles.height; y++) {
      for (let x = t * tileW; x < (t + 1) * tileW; x++) {
        if (roles.data[(y * roles.width + x) * 4] !== role) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    zones.push(x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return zones;
}

/** L'écusson réduit à la taille de la zone (pixels opaques seulement). */
function ecussonReduit(logo, w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const k = Math.min(w / logo.width, h / logo.height);
  g.drawImage(logo, (w - logo.width * k) / 2, (h - logo.height * k) / 2, logo.width * k, logo.height * k);
  return g.getImageData(0, 0, w, h);
}

/**
 * Réduit une image à `n` couleurs au plus (k-moyennes sur les couleurs
 * distinctes, pondérées par leur nombre de pixels, départ déterministe).
 */
export function limiteCouleurs(img, n = 64) {
  const compte = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    compte.set(k, (compte.get(k) ?? 0) + 1);
  }
  if (compte.size <= n) return;
  const couleurs = [...compte.entries()].map(([k, p]) => ({ c: [(k >> 16) & 255, (k >> 8) & 255, k & 255], p, k }));
  couleurs.sort((a, b) => b.p - a.p);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // départ : les couleurs fréquentes les plus éloignées les unes des autres
  const centres = [couleurs[0].c.slice()];
  while (centres.length < n) {
    let meilleur = null;
    let dmax = -1;
    for (const { c, p } of couleurs) {
      const d = Math.min(...centres.map((z) => d2(c, z))) * Math.sqrt(p);
      if (d > dmax) {
        dmax = d;
        meilleur = c;
      }
    }
    centres.push(meilleur.slice());
  }
  const proche = (c) => {
    let j = 0;
    let dm = Infinity;
    centres.forEach((z, i) => {
      const d = d2(c, z);
      if (d < dm) {
        dm = d;
        j = i;
      }
    });
    return j;
  };
  for (let it = 0; it < 12; it++) {
    const somme = centres.map(() => [0, 0, 0, 0]);
    for (const { c, p } of couleurs) {
      const s = somme[proche(c)];
      s[0] += c[0] * p;
      s[1] += c[1] * p;
      s[2] += c[2] * p;
      s[3] += p;
    }
    somme.forEach((s, i) => {
      if (s[3]) centres[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  const table = new Map(couleurs.map(({ c, k }) => [k, centres[proche(c)].map(Math.round)]));
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const c = table.get((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
    img.data[i] = c[0];
    img.data[i + 1] = c[1];
    img.data[i + 2] = c[2];
  }
}

/**
 * Repeint un dessin pour une équipe. `eq` : { maillot, fonce, clair, casque }
 * (hex). `logo` : image de l'écusson, peinte dans la zone prévue sur la poitrine.
 */
function repeint(src, roles, ROLES, eq, logo, tileW, nb) {
  const R = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  const casque = hex(eq.casque);
  const cibles = {
    maillot: hex(eq.maillot),
    bande: hex(eq.fonce),
    blanc: hex(eq.clair),
    casque,
    'casque-bande': lum(casque) < 60 ? hex(eq.clair) : hex(eq.fonce),
    gants: hex(eq.fonce),
  };
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const role = ROLES[roles.data[i]];
    const px = [out[i], out[i + 1], out[i + 2]];
    let c = null;
    if (role === 'contour') c = contour(px);
    else if (role === 'ecusson') c = cibles.maillot;
    else if (cibles[role]) c = teinte(px, REF[role], cibles[role]);
    if (c) out.set(c, i);
  }
  if (logo) {
    zonesEcusson(roles, tileW, nb, R.ecusson).forEach((z) => {
      if (!z) return;
      const e = ecussonReduit(logo, z.w, z.h);
      for (let y = 0; y < z.h; y++) {
        for (let x = 0; x < z.w; x++) {
          const j = (y * z.w + x) * 4;
          const i = ((z.y0 + y) * src.width + z.x0 + x) * 4;
          if (e.data[j + 3] < 128 || out[i + 3] === 0 || roles.data[i] !== R.ecusson) continue;
          out.set([e.data[j], e.data[j + 1], e.data[j + 2]], i);
        }
      }
    });
  }
  const img = { data: out, width: src.width, height: src.height };
  limiteCouleurs(img);
  return img;
}

/** Feuille : les cases telles quelles (vers la droite), puis la rangée miroir (vers la gauche). */
function feuilleDeuxSens(img, tileW, tileH, nb) {
  const c = createCanvas(tileW * nb, tileH * 2);
  const g = c.getContext('2d');
  const tmp = createCanvas(img.width, img.height);
  tmp.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  g.drawImage(tmp, 0, 0);
  for (let t = 0; t < nb; t++) {
    g.save();
    g.translate((t + 1) * tileW, tileH);
    g.scale(-1, 1);
    g.drawImage(tmp, t * tileW, 0, tileW, tileH, 0, 0, tileW, tileH);
    g.restore();
  }
  return c;
}

export function feuilleJoueur(S, eq, logo) {
  const { tileW, tileH, images } = S.meta.joueur;
  return feuilleDeuxSens(repeint(S.joueur, S.joueurRoles, S.meta.roles, eq, logo, tileW, images), tileW, tileH, images);
}

export function feuilleGardien(S, eq, logo) {
  const { tileW, tileH } = S.meta.gardien;
  return feuilleDeuxSens(repeint(S.gardien, S.gardienRoles, S.meta.roles, eq, logo, tileW, 1), tileW, tileH, 1);
}

/**
 * Calque des visages : une rangée par variante (vers la droite), puis les
 * mêmes en miroir. Seuls les pixels de peau et de barbe y sont dessinés, à
 * poser par-dessus le joueur.
 */
export function feuilleVisages(S) {
  const { tileW, tileH, images } = S.meta.joueur;
  const R = Object.fromEntries(S.meta.roles.map((r, i) => [r, i]));
  const src = S.joueur;
  const roles = S.joueurRoles;
  const basePeau = couleurDominante(src, roles, R.peau);
  const baseBarbe = couleurDominante(src, roles, R.barbe);
  const c = createCanvas(tileW * images, tileH * VISAGES.length * 2);
  const g = c.getContext('2d');
  VISAGES.forEach((v, rang) => {
    const out = new Uint8ClampedArray(src.data.length);
    for (let i = 0; i < out.length; i += 4) {
      const role = roles.data[i];
      if (src.data[i + 3] === 0 || (role !== R.peau && role !== R.barbe)) continue;
      const px = [src.data[i], src.data[i + 1], src.data[i + 2]];
      const cible = v ? hex(role === R.peau ? v.peau : v.barbe) : null;
      out.set(cible ? teinte(px, role === R.peau ? basePeau : baseBarbe, cible) : px, i);
      out[i + 3] = 255;
    }
    // 16 couleurs par visage : le joueur habillé reste dans l'esprit « 64 couleurs »
    limiteCouleurs({ data: out, width: src.width, height: src.height }, 16);
    const tmp = createCanvas(src.width, src.height);
    tmp.getContext('2d').putImageData(new ImageData(out, src.width, src.height), 0, 0);
    g.drawImage(tmp, 0, rang * tileH);
    for (let t = 0; t < images; t++) {
      g.save();
      g.translate((t + 1) * tileW, (VISAGES.length + rang) * tileH);
      g.scale(-1, 1);
      g.drawImage(tmp, t * tileW, 0, tileW, tileH, 0, 0, tileW, tileH);
      g.restore();
    }
  });
  return c;
}
