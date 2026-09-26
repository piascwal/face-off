import { pointCrosse } from '@core/actions';
import type { Goalie, Puck, Skater } from '@core/types';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C, MARQUE } from './theme';
import type { EquipeVisuelle } from './team-visuals';

/** Couleur fixe du repère « c'est vous » — jamais celle d'un maillot, pour ne
 * jamais se confondre avec une équipe (voir dessinePatineur). */
const COULEUR_CONTROLE = MARQUE.bleu;

/**
 * Anneau pulsant au sol sous un patineur — sert de base aux indicateurs
 * visuels : qui est sélectionné, et qui porte le palet.
 */
function haloSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number, epais = 1): void {
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.lineWidth = epais;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

/** Flaque de lumière douce au sol (fondu additif) : se voit de loin, même dans une
 * mêlée, contrairement à un simple anneau qu'on peut confondre avec le marquage
 * de la glace. */
function lueurSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number): void {
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/**
 * Palet vu de trois quarts (dessus clair, tranche noire) qui rebondit au-dessus
 * de la tête de celui qui l'a en sa possession (bas du palet en `y`).
 */
function badgePalet(g: CanvasRenderingContext2D, x: number, y: number, temps: number): void {
  const by = Math.round(y - Math.abs(Math.sin(temps * 5)) * 2);
  // [décalage y, largeur, couleur] ligne par ligne, contour compris
  const lignes: [number, number, string][] = [
    [-8, 7, C.contour],
    [-7, 11, C.contour],
    [-6, 13, C.contour],
    [-5, 13, C.contour],
    [-4, 13, C.contour],
    [-3, 13, C.contour],
    [-2, 11, C.contour],
    [-1, 7, C.contour],
  ];
  for (const [dy, w, c] of lignes) px(g, x - (w - 1) / 2, by + dy, w, 1, c);
  // dessus du palet : ellipse gris-bleu avec un reflet, puis la tranche noire
  px(g, x - 2, by - 7, 5, 1, '#5b6488');
  px(g, x - 4, by - 6, 9, 1, '#6e78a0');
  px(g, x - 4, by - 5, 9, 1, '#4a5274');
  px(g, x - 2, by - 7, 2, 1, '#c9d2e3');
  px(g, x - 3, by - 6, 1, 1, '#aab4cf');
  px(g, x - 5, by - 4, 11, 2, '#0c0e16');
  px(g, x - 3, by - 2, 7, 1, '#0c0e16');
}

/**
 * Flèche pointée vers le joueur qu'on pilote (bas de la pointe en `y`) :
 * se repère d'un coup d'œil, même dans une mêlée. `simple` : version plus
 * petite, pour le joueur de l'autre humain en Wi-Fi.
 */
function flecheControle(g: CanvasRenderingContext2D, x: number, y: number, couleur = COULEUR_CONTROLE, simple = false): void {
  const lignes = simple ? [5, 3, 1] : [9, 7, 5, 3, 1];
  const y0 = y - lignes.length;
  // contour d'un pixel autour de la pointe
  lignes.forEach((w, i) => px(g, x - w / 2 - 1, y0 + i - 1, w + 2, 3, C.contour));
  lignes.forEach((w, i) => px(g, x - w / 2, y0 + i, w, 1, couleur));
  // reflet sur le bord haut
  px(g, x - lignes[0]! / 2, y0, lignes[0]! - 1, 1, '#ffffff');
  g.globalAlpha = 0.35;
  px(g, x - lignes[0]! / 2, y0, lignes[0]!, 1, couleur);
  g.globalAlpha = 1;
}

/** Pas de patinage : distance parcourue (px logiques) par image du cycle. */
const PAS_ANIM = 8;
export function dessinePatineur(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  s: Skater,
  temps: number,
  estControle: boolean,
  equipes: [EquipeVisuelle, EquipeVisuelle],
  specialPret: boolean,
): void {
  const M = sprites.meta.joueur;
  const e = M.echelle;
  // taille des repères au sol, proportionnelle au joueur
  const rs = e / 0.28;
  const gauche = Math.cos(s.face) < 0;
  const v = Math.hypot(s.vx, s.vy);
  const frame = v < 14 ? M.arret : Math.floor(s.anim / PAS_ANIM) % M.images;
  const sprite = sprites.spriteJoueur(equipes[s.eq].id, frame, gauche);
  // chaque joueur garde son visage (teint, barbe) : même tirage sur les deux écrans en Wi-Fi
  const visage = sprites.spriteVisage(s.rang * 2 + s.eq * 3, frame, gauche);
  const tw = M.tileW * e;
  const th = M.tileH * e;
  // le tronc du joueur sur sa position (4 px sous son centre : là où il touche la glace)
  const piedX = gauche ? M.tileW - M.pied.x : M.pied.x;
  let bx = s.x - piedX * e;
  const by = s.y + 4 - M.pied.y * e;
  if (s.sonne > 0) bx += Math.sin(temps * 40);
  const teteY = by + M.tete * e + 2;
  const sp = pointCrosse(s);
  const corps = (dx = 0, dy = 0) => {
    if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx + dx, by + dy, tw, th);
    if (visage) g.drawImage(visage.img, visage.rect.sx, visage.rect.sy, visage.rect.sw, visage.rect.sh, bx + dx, by + dy, tw, th);
  };

  // indicateur « c'est vous » : toujours visible, même en tenant le palet — une
  // couleur fixe (jamais celle d'un maillot) pour ne se confondre ni avec une
  // équipe ni avec le marquage doré du porteur du palet ci-dessous.
  if (estControle) {
    haloSol(g, s.x, s.y + 4, 8 * rs, COULEUR_CONTROLE, 0.5 + 0.25 * Math.sin(temps * 6));
  }
  // indicateur « porte le palet » : flaque de lumière douce + anneau net au sol,
  // plus le palet qui rebondit au-dessus de la tête — la flaque se repère de loin,
  // même à moitié cachée derrière d'autres joueurs dans une mêlée.
  if (s.tient) {
    lueurSol(g, s.x, s.y + 4, 12 * rs, C.or, 0.5 + 0.15 * Math.sin(temps * 8));
    haloSol(g, s.x, s.y + 4, 9 * rs, C.or, 1, 2);
    haloSol(g, s.x, s.y + 4, 11 * rs, '#fff3b0', 0.5 + 0.3 * Math.sin(temps * 8));
  }
  // tir spécial chargé (combo de passes) : petite flamme pulsante au-dessus du porteur
  if (s.tient && specialPret) {
    const rebond = Math.abs(Math.sin(temps * 9)) * 2;
    const fx = Math.round(s.x);
    const fy = teteY - (estControle ? 23 : 15) - rebond;
    px(g, fx - 2, fy - 2, 5, 5, C.contour);
    px(g, fx - 1, fy - 1, 3, 3, '#ff8a3d');
    px(g, fx, fy - 2, 1, 1, '#ffd35c');
  }

  corps();

  if (s.sonne > 0) {
    for (let i = 0; i < 3; i++) {
      const a = temps * 6 + i * 2.1;
      px(g, s.x + Math.cos(a) * 6, teteY - 1 + Math.sin(a) * 2, 1, 1, C.or);
    }
  }
  if (s.elanT > 0) {
    g.globalAlpha = 0.35;
    corps(-s.vx * 0.04, -s.vy * 0.04);
    g.globalAlpha = 1;
  }
  // au-dessus de la tête : la flèche du joueur piloté, et le palet de celui qui le porte (au-dessus de la flèche)
  let hautRepere = teteY - 2;
  if (estControle) {
    flecheControle(g, Math.round(s.x), hautRepere + Math.round(Math.sin(temps * 6)));
    hautRepere -= 8;
  } else if (s.humain) {
    // l'adversaire humain d'une partie en réseau : petite flèche à ses couleurs
    flecheControle(g, Math.round(s.x), hautRepere, equipes[s.eq].clair, true);
    hautRepere -= 6;
  }
  if (s.tient) badgePalet(g, Math.round(s.x), hautRepere, temps);
  if (estControle && s.arme && s.vise !== null) {
    // flèche de visée pointillée, qui s'allonge avec la puissance
    const L = 12 + 26 * s.charge;
    const c = s.charge > 0.85 ? '#ff5a4e' : C.or;
    for (let k = 4; k < L; k += 4) {
      const x = sp.x + Math.cos(s.vise) * k;
      const y = sp.y + Math.sin(s.vise) * k;
      px(g, x - 1, y - 1, 3, 3, C.contour);
      px(g, x, y, 1, 1, c);
    }
    const bx_ = sp.x + Math.cos(s.vise) * L;
    const by_ = sp.y + Math.sin(s.vise) * L;
    px(g, bx_ - 2, by_ - 2, 5, 5, C.contour);
    px(g, bx_ - 1, by_ - 1, 3, 3, c);
  }
}

export function dessineGardien(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  gk: Goalie,
  temps: number,
  equipes: [EquipeVisuelle, EquipeVisuelle],
): void {
  const M = sprites.meta.gardien;
  const e = M.echelle;
  const gauche = gk.eq === 1;
  const sprite = sprites.spriteGardien(equipes[gk.eq].id, gauche);
  const piedX = gauche ? M.tileW - M.pied.x : M.pied.x;
  const bx = gk.x - piedX * e + Math.sin(temps * 60) * gk.secoue;
  const by = gk.y + 4 - M.pied.y * e;
  if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx, by, M.tileW * e, M.tileH * e);
}

export function dessinePalet(g: CanvasRenderingContext2D, p: Puck): void {
  const v = Math.hypot(p.vx, p.vy);
  if (!p.porteur && v > 170) {
    g.globalCompositeOperation = 'lighter';
    const n = p.trace.length;
    for (let i = 0; i < n; i++) {
      const t = p.trace[i]!;
      g.globalAlpha = (i / n) * 0.6;
      g.fillStyle = v > 330 ? '#ffb04a' : '#8fe3ff';
      g.fillRect(Math.round(t.x) - 1, Math.round(t.y), 2, 1);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  const x = Math.round(p.x) - 2;
  const y = Math.round(p.y) - 1;
  g.fillStyle = 'rgba(20,40,80,0.35)';
  g.fillRect(x, y + 2, 4, 1);
  g.fillStyle = '#0c0e16';
  g.fillRect(x, y, 4, 2);
  g.fillStyle = '#4a5068';
  g.fillRect(x + 1, y, 2, 1);
}

/** Traînées de patins qui s'estompent lentement sur la glace. */
export class TracesGlace {
  private canvas = document.createElement('canvas');

  reinitialise(W: number, H: number): void {
    this.canvas.width = W;
    this.canvas.height = H;
  }

  dessine(g: CanvasRenderingContext2D, patineurs: Skater[], temps: number): void {
    const rc = this.canvas.getContext('2d')!;
    if (Math.floor(temps * 2) !== Math.floor((temps - 1 / 60) * 2)) {
      rc.globalCompositeOperation = 'destination-out';
      rc.fillStyle = 'rgba(0,0,0,0.08)';
      rc.fillRect(0, 0, this.canvas.width, this.canvas.height);
      rc.globalCompositeOperation = 'source-over';
    }
    rc.fillStyle = 'rgba(120,160,195,0.22)';
    for (const s of patineurs) {
      if (Math.hypot(s.vx, s.vy) < 30) continue;
      const pied = Math.floor(s.anim / 8) & 1;
      rc.fillRect(Math.round(s.x) + (pied ? -2 : 1), Math.round(s.y) + 3, 1, 1);
    }
    g.drawImage(this.canvas, 0, 0);
  }
}

export function dessineParticules(g: CanvasRenderingContext2D, particules: { x: number; y: number; vie: number; max: number; c: string; t: number; lum?: boolean }[]): void {
  for (const p of particules) {
    const a = Math.min(1, p.vie / (p.max * 0.5));
    if (p.lum) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a;
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.t, p.t);
    if (p.lum) g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = 1;
}
