import { pointCrosse } from '@core/actions';
import type { Goalie, Puck, Skater } from '@core/types';
import { ligne, px } from './primitives';
import type { BanqueSprites } from './sprites';
import { C } from './theme';
import type { EquipeVisuelle } from './team-visuals';

const CYCLE = [0, 1, 0, 2];

/**
 * Anneau pulsant au sol sous un patineur — sert de base aux deux indicateurs
 * visuels ajoutés au POC : qui est sélectionné, et qui porte le palet.
 */
function haloSol(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, alpha: number): void {
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

/** Petit palet qui rebondit au-dessus de la tête de celui qui l'a en sa possession. */
function badgePalet(g: CanvasRenderingContext2D, x: number, y: number, temps: number): void {
  const rebond = Math.abs(Math.sin(temps * 5)) * 2;
  const by = y - rebond;
  px(g, x - 2, by - 1, 4, 2, C.contour);
  px(g, x - 1, by - 1, 2, 1, '#4a5068');
}

export function dessinePatineur(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  s: Skater,
  temps: number,
  estControle: boolean,
  equipes: [EquipeVisuelle, EquipeVisuelle],
  specialPret: boolean,
): void {
  const gauche = Math.cos(s.face) < 0;
  const v = Math.hypot(s.vx, s.vy);
  const frame = v < 14 ? 0 : CYCLE[Math.floor(s.anim / 8) % 4]!;
  const sprite = sprites.spriteJoueur(equipes[s.eq].id, frame, gauche);
  const { w: tw, h: th } = sprites.tailleJoueur;
  let bx = Math.round(s.x) - tw / 2;
  let by = Math.round(s.y) + 3 - th + 4;
  if (s.sonne > 0) bx += Math.round(Math.sin(temps * 40));
  const sp = pointCrosse(s);
  const mainX = bx + (gauche ? tw * 0.28 : tw * 0.72);
  const mainY = by + th * 0.5;
  const crosse = () => {
    ligne(g, mainX, mainY, sp.x, sp.y, '#5b3a22');
    const lx = Math.round(sp.x);
    const ly = Math.round(sp.y);
    const dx = Math.cos(s.face) >= 0 ? 1 : -1;
    g.fillStyle = '#111522';
    g.fillRect(Math.min(lx, lx + dx * 2), ly, 3, 1);
  };

  // indicateur « sélectionné » : visible même sans le palet, pour ne jamais perdre
  // de vue le patineur qu'on pilote.
  if (estControle && !s.tient) {
    haloSol(g, s.x, s.y + 4, 7, equipes[0].clair, 0.55 + 0.25 * Math.sin(temps * 6));
  }
  // indicateur « porte le palet » : anneau doré au sol + palet qui rebondit au-dessus
  // de la tête, visible pour les deux équipes (utile en défense comme en attaque).
  if (s.tient) {
    haloSol(g, s.x, s.y + 4, 6, C.or, 0.75 + 0.2 * Math.sin(temps * 8));
    badgePalet(g, Math.round(s.x), by - 2, temps);
  }
  // tir spécial chargé (combo de passes) : petite flamme pulsante au-dessus du porteur
  if (s.tient && specialPret) {
    const rebond = Math.abs(Math.sin(temps * 9)) * 2;
    const fx = Math.round(s.x);
    const fy = by - 8 - rebond;
    px(g, fx - 2, fy - 2, 5, 5, C.contour);
    px(g, fx - 1, fy - 1, 3, 3, '#ff8a3d');
    px(g, fx, fy - 2, 1, 1, '#ffd35c');
  }

  if (sp.y < s.y) crosse();
  if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx, by, tw, th);
  if (sp.y >= s.y) crosse();

  if (s.sonne > 0) {
    for (let i = 0; i < 3; i++) {
      const a = temps * 6 + i * 2.1;
      px(g, s.x + Math.cos(a) * 6, by - 2 + Math.sin(a) * 2, 1, 1, C.or);
    }
  }
  if (s.elanT > 0 && sprite) {
    g.globalAlpha = 0.35;
    g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, Math.round(bx - s.vx * 0.04), Math.round(by - s.vy * 0.04), tw, th);
    g.globalAlpha = 1;
  }
  if (s.humain) {
    // flèche au-dessus du joueur, pour ne jamais le perdre de vue
    const fy = by - 5 + Math.round(Math.sin(temps * 6));
    g.fillStyle = C.contour;
    g.fillRect(Math.round(s.x) - 3, fy - 1, 7, 1);
    g.fillRect(Math.round(s.x) - 2, fy + 2, 5, 1);
    g.fillStyle = equipes[0].clair;
    g.fillRect(Math.round(s.x) - 2, fy, 5, 1);
    g.fillRect(Math.round(s.x) - 1, fy + 1, 3, 1);
    g.fillRect(Math.round(s.x), fy + 2, 1, 1);
  }
  if (s.humain && s.arme && s.vise !== null) {
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
  if (s.arme) {
    const w = 13;
    const x = Math.round(s.x) - 6;
    const y = by - (s.humain ? 11 : 5);
    px(g, x - 1, y - 1, w + 2, 4, C.contour);
    px(g, x, y, w, 2, '#2a2f4a');
    const c = s.charge > 0.85 ? (Math.floor(temps * 20) & 1 ? '#ffffff' : '#ff5a4e') : s.charge > 0.5 ? '#ffb13b' : '#ffe27a';
    px(g, x, y, Math.max(1, Math.round(w * s.charge)), 2, c);
  }
}

export function dessineGardien(
  g: CanvasRenderingContext2D,
  sprites: BanqueSprites,
  gk: Goalie,
  temps: number,
  equipes: [EquipeVisuelle, EquipeVisuelle],
): void {
  const gauche = gk.eq === 1;
  const sprite = sprites.spriteGardien(equipes[gk.eq].id, gauche);
  const { w: tw, h: th } = sprites.tailleJoueur;
  const bx = Math.round(gk.x) - tw / 2 + Math.round(Math.sin(temps * 60) * gk.secoue);
  const by = Math.round(gk.y) + 3 - th + 4;
  if (sprite) g.drawImage(sprite.img, sprite.rect.sx, sprite.rect.sy, sprite.rect.sw, sprite.rect.sh, bx, by, tw, th);
  // crosse de gardien, posée sur la glace
  const dir = gauche ? -1 : 1;
  g.fillStyle = '#5b3a22';
  g.fillRect(Math.round(gk.x) + dir * 3 - (dir < 0 ? 3 : 0), Math.round(gk.y) + 3, 4, 1);
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
