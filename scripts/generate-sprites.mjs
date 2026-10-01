#!/usr/bin/env node
// Génère les feuilles de sprites PNG des patineurs et gardiens, les écussons
// détourés et les icônes PWA.
//
// Les joueurs et les gardiens viennent d'illustrations pixel art converties
// par convertit-sources.py (assets/sprites-src/) : ce script les repeint pour
// chaque équipe et chaque maillot, pose l'écusson de l'équipe sur la poitrine
// et dessine le calque des variantes de visage (voir sprites-illustres.mjs).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detoure } from './logo-cutout.mjs';
import {
  chargeSources,
  feuilleCelebrations,
  feuilleChute,
  feuilleGardien,
  feuilleJoueur,
  feuillePortrait,
  feuilleTir,
  feuilleVisages,
  VISAGES,
} from './sprites-illustres.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_SPRITES = path.join(__dirname, '..', 'public', 'sprites');
const OUT_ICONS = path.join(__dirname, '..', 'public', 'icons');
const OUT_LOGOS = path.join(__dirname, '..', 'public', 'logos');
const SRC_LOGOS = path.join(__dirname, '..', 'assets', 'logos-src');
mkdirSync(OUT_SPRITES, { recursive: true });
mkdirSync(OUT_ICONS, { recursive: true });
mkdirSync(OUT_LOGOS, { recursive: true });

// Couleurs de maillot dérivées des écussons dans assets/logos-src/ — tenues
// synchronisées à la main avec src/render/team-visuals.ts (ce script tourne
// en Node pur, sans les alias TS du reste du projet). Chaque équipe a un
// maillot domicile et un maillot extérieur (corps/bande inversés) pour que
// le joueur puisse éviter un choc de couleurs avec l'adversaire.
const INTERIEURS = [
  { id: 'toulouse', maillot: '#d81f26', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
  { id: 'nice', maillot: '#17181a', fonce: '#7a1017', clair: '#e8b73a', casque: '#17181a' },
  { id: 'vaujany', maillot: '#9c2b1f', fonce: '#5c3a1e', clair: '#dba24a', casque: '#5c3a1e' },
  { id: 'nimes', maillot: '#2f7d3a', fonce: '#163a1b', clair: '#d8b23a', casque: '#163a1b' },
  { id: 'grenoble', maillot: '#2f6fd0', fonce: '#0c1830', clair: '#f2661c', casque: '#0c1830' },
  { id: 'montpellier', maillot: '#0d1e4a', fonce: '#071230', clair: '#e8611c', casque: '#0d1e4a' },
  { id: 'montreal', maillot: '#af1e2d', fonce: '#14205c', clair: '#ffffff', casque: '#14205c' },
  { id: 'ducks', maillot: '#0d0d0d', fonce: '#c9a227', clair: '#f2661c', casque: '#0d0d0d' },
  { id: 'marseille', maillot: '#2f7bbf', fonce: '#16213e', clair: '#c7ccd1', casque: '#2b2f38' },
  { id: 'valence', maillot: '#c41e3a', fonce: '#0d0d0d', clair: '#ffffff', casque: '#0d0d0d' },
  { id: 'annecy', maillot: '#141414', fonce: '#8b1e1e', clair: '#ffffff', casque: '#141414' },
  { id: 'colorado', maillot: '#6f263d', fonce: '#236192', clair: '#ffffff', casque: '#6f263d' },
  { id: 'roanne', maillot: '#141414', fonce: '#f2c200', clair: '#ffffff', casque: '#141414' },
  { id: 'ottawa', maillot: '#c8102e', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
];
const VARIANTES = ['interieur', 'exterieur'];
function palette(base, variante) {
  if (variante === 'interieur') return base;
  return { maillot: base.clair, fonce: base.fonce, clair: base.maillot, casque: base.casque };
}
const EQUIPES = INTERIEURS.flatMap((base) =>
  VARIANTES.map((variante) => ({
    ...palette(base, variante),
    id: `${base.id}-${variante}`,
    base: base.id,
  })),
);
const EQUIPES_LOGO = INTERIEURS; // un seul écusson par équipe, indépendant du maillot
// --- Écussons des équipes : fond retiré (damier « transparent » ou couleur
// pleine selon la source, voir logo-cutout.mjs), recadrés en carré sur un
// fond PNG transparent. ------------------------------------------------------

function boiteOpaque({ data, width, height }) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 } : { x0, y0, x1, y1 };
}

async function traiteLogos() {
  // assez grand pour l'animation de but, où l'écusson occupe presque tout l'écran
  const TAILLE = 256;
  for (const eq of EQUIPES_LOGO) {
    const img = await loadImage(path.join(SRC_LOGOS, `${eq.id}.jpg`));
    const brut = createCanvas(img.width, img.height);
    const bctx = brut.getContext('2d');
    bctx.drawImage(img, 0, 0);
    const imgData = bctx.getImageData(0, 0, img.width, img.height);
    detoure(imgData);
    bctx.putImageData(imgData, 0, 0);

    // recadre sur la partie opaque : certaines sources ont une large marge de
    // fond qui, une fois transparente, rapetisserait l'écusson à l'écran
    const { x0, y0, x1, y1 } = boiteOpaque(imgData);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;

    const canvas = createCanvas(TAILLE, TAILLE);
    const ctx = canvas.getContext('2d');
    const marge = TAILLE * 0.03;
    const dispo = TAILLE - marge * 2;
    const echelle = Math.min(dispo / bw, dispo / bh);
    const w = bw * echelle;
    const h = bh * echelle;
    ctx.drawImage(brut, x0, y0, bw, bh, (TAILLE - w) / 2, (TAILLE - h) / 2, w, h);
    writeFileSync(path.join(OUT_LOGOS, `${eq.id}.png`), canvas.toBuffer('image/png'));
  }
}

await traiteLogos();

// --- Joueurs et gardiens --------------------------------------------------

/**
 * Taille d'un pixel de sprite, en pixels logiques du jeu : le patineur fait
 * environ 28 px de haut en jeu (plus grand, les mêlées devenaient illisibles),
 * le gardien environ 23, pour laisser voir la cage derrière lui.
 */
const ECHELLE_JOUEUR = 0.28;
const ECHELLE_GARDIEN = 0.2;
/** Le joueur au sol (dessin deux fois moins fin que la planche) : casque de la même taille qu'en patinant. */
const ECHELLE_CHUTE = 0.22;
/**
 * Décalage de dessin (px de sprite) par rapport au point d'ancrage : le
 * patineur est dessiné un peu en arrière pour que la palette de sa crosse
 * tombe sur le palet qu'il porte ; le gardien, en avant, pour se tenir
 * devant sa cage plutôt que dessus.
 */
const DECALAGE_JOUEUR = 10;
const DECALAGE_GARDIEN = -41;
const sources = await chargeSources(path.join(__dirname, '..', 'assets', 'sprites-src'));

for (const eq of EQUIPES) {
  const logo = await loadImage(path.join(OUT_LOGOS, `${eq.base}.png`));
  writeFileSync(path.join(OUT_SPRITES, `skater-${eq.id}.png`), feuilleJoueur(sources, eq, logo).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `goalie-${eq.id}.png`), feuilleGardien(sources, eq, logo).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `portrait-${eq.id}.png`), feuillePortrait(sources, eq, logo).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `chute-${eq.id}.png`), feuilleChute(sources, eq).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `tir-${eq.id}.png`), feuilleTir(sources, eq, logo).toBuffer('image/png'));
  writeFileSync(path.join(OUT_SPRITES, `celebration-${eq.id}.png`), feuilleCelebrations(sources, eq).toBuffer('image/png'));
}
writeFileSync(path.join(OUT_SPRITES, 'visages.png'), feuilleVisages(sources).toBuffer('image/png'));
writeFileSync(path.join(OUT_SPRITES, 'visages-tir.png'), feuilleVisages(sources, 'tir').toBuffer('image/png'));

const { joueur, gardien, portrait, chute, celebration, tir } = sources.meta;
writeFileSync(
  path.join(OUT_SPRITES, 'meta.json'),
  JSON.stringify(
    {
      joueur: { ...joueur, echelle: ECHELLE_JOUEUR, decalage: DECALAGE_JOUEUR },
      gardien: { ...gardien, echelle: ECHELLE_GARDIEN, decalage: DECALAGE_GARDIEN },
      portrait,
      chute: { ...chute, echelle: ECHELLE_CHUTE },
      // même échelle que le patinage (même hauteur de joueur), même recul de dessin
      tir: { ...tir, echelle: ECHELLE_JOUEUR, decalage: DECALAGE_JOUEUR },
      celebration,
      visages: VISAGES.length,
      teamIds: EQUIPES_LOGO.map((e) => e.id),
      variants: VARIANTES,
    },
    null,
    2,
  ),
);

// --- Icônes PWA : l'illustration du jeu (assets/icone-app.jpg, carrée) -------

const illustrationIcone = await loadImage(path.join(__dirname, '..', 'assets', 'icone-app.jpg'));

/**
 * Icône carrée à partir de l'illustration. Version « maskable » (Android la
 * découpe en cercle ou en carré arrondi) : le joueur doit tenir dans les 80 %
 * centraux, donc l'illustration est réduite, ses bords estompés, et posée sur
 * un dégradé de la même ambiance (salle sombre, glace).
 */
function dessineIcone(taille, maskable) {
  const canvas = createCanvas(taille, taille);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const W = illustrationIcone.width;
  const H = illustrationIcone.height;
  if (!maskable) {
    ctx.drawImage(illustrationIcone, 0, 0, taille, taille);
    return canvas;
  }
  const k = 0.72;
  const d = taille * k;
  const x0 = (taille - d) / 2;
  // fond : la salle sombre en haut, la glace en bas (couleurs des bords de l'illustration)
  const fond = ctx.createLinearGradient(0, 0, 0, taille);
  fond.addColorStop(0, '#10213a');
  fond.addColorStop(0.45, '#16294a');
  fond.addColorStop(0.62, '#3472a8');
  fond.addColorStop(1, '#4aa3d8');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, taille, taille);
  // l'illustration réduite, ses bords estompés (masque de transparence en deux passes)
  const t = createCanvas(Math.round(d), Math.round(d));
  const g = t.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(illustrationIcone, 0, 0, t.width, t.height);
  const f = 0.09;
  g.globalCompositeOperation = 'destination-in';
  for (const [x1, y1] of [
    [t.width, 0],
    [0, t.height],
  ]) {
    const m = g.createLinearGradient(0, 0, x1, y1);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(f, 'rgba(0,0,0,1)');
    m.addColorStop(1 - f, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, t.width, t.height);
  }
  ctx.drawImage(t, x0, x0);
  return canvas;
}

writeFileSync(path.join(OUT_ICONS, 'icon-192.png'), dessineIcone(192, false).toBuffer('image/png'));
writeFileSync(path.join(OUT_ICONS, 'icon-512.png'), dessineIcone(512, false).toBuffer('image/png'));
writeFileSync(path.join(OUT_ICONS, 'icon-maskable-512.png'), dessineIcone(512, true).toBuffer('image/png'));

console.log('Sprites et icônes générés dans public/sprites/ et public/icons/');
