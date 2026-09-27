import { ELAN_CD_PALET, POKE_RECHARGE } from '@core/constants';
import type { Skater } from '@core/types';
import { GLISSE_MIN, RAYON_JOY, zoneElan, zonePasse, zoneTir } from './hud-zones';
import type { InstantaneUI } from '@input/game-input';
import { texte } from './pixel-font';
import { anneau, disque, ligne } from './primitives';
import { C } from './theme';

export function dessineCommandes(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  temps: number,
  s: Skater | null,
  ui: InstantaneUI,
  menace = false,
): void {
  if (!ui.tactile || !s) return;

  if (ui.joy) {
    g.globalAlpha = 0.5;
    anneau(g, ui.joy.bx, ui.joy.by, RAYON_JOY, C.blanc, 1, 2);
    g.globalAlpha = 0.85;
    let dx = ui.joy.x - ui.joy.bx;
    let dy = ui.joy.y - ui.joy.by;
    const d = Math.hypot(dx, dy);
    if (d > RAYON_JOY) {
      dx *= RAYON_JOY / d;
      dy *= RAYON_JOY / d;
    }
    disque(g, ui.joy.bx + dx, ui.joy.by + dy, 9, C.contour);
    disque(g, ui.joy.bx + dx, ui.joy.by + dy, 8, '#dfe8ff');
    disque(g, ui.joy.bx + dx - 2, ui.joy.by + dy - 2, 3, '#ffffff');
    g.globalAlpha = 1;
  } else if (temps < 25) {
    g.globalAlpha = 0.28 + 0.12 * Math.sin(temps * 3);
    anneau(g, 40, H - 40, RAYON_JOY, C.blanc, 1, 2);
    disque(g, 40, H - 40, 8, C.blanc);
    g.globalAlpha = 1;
    texte(g, 'GLISSEZ', 40, H - 13, C.blanc, 1, 'c');
  }

  const zt = zoneTir(W, H);
  const zpa = zonePasse(W, H);
  const ze = zoneElan(W, H);
  const tAppui = ui.tir !== null;
  g.globalAlpha = tAppui ? 0.9 : 0.6;
  disque(g, zt.x, zt.y, zt.r, C.contour);
  // rouge pour tirer, violet pour le coup de crosse (gris le temps qu'il se recharge)
  const crossePrete = s.pokeT <= -POKE_RECHARGE + 1e-3;
  const [fond, face] = s.tient ? ['#ff5470', '#e03a58'] : !crossePrete ? ['#6b7295', '#5a6082'] : ['#8a7cf0', '#6f62d6'];
  disque(g, zt.x, zt.y + (tAppui ? 1 : 0), zt.r - 1, fond);
  if (!tAppui) disque(g, zt.x, zt.y + 1, zt.r - 3, face);
  if (s.arme) anneau(g, zt.x, zt.y, zt.r + 2, C.or, s.charge, 2);
  g.globalAlpha = 1;
  const libelle = s.tient ? 'TIR' : 'CROSSE';
  texte(g, libelle, zt.x, zt.y - 3 + (tAppui ? 1 : 0), C.blanc, 1, 'c');
  if (ui.tir && s.arme) {
    const dx = ui.tir.x - ui.tir.x0;
    const dy = ui.tir.y - ui.tir.y0;
    if (Math.hypot(dx, dy) > GLISSE_MIN) {
      g.globalAlpha = 0.8;
      ligne(g, ui.tir.x0, ui.tir.y0, ui.tir.x, ui.tir.y, C.or);
      disque(g, ui.tir.x, ui.tir.y, 3, C.or);
      g.globalAlpha = 1;
    } else if (s.tient) {
      texte(g, 'GLISSEZ', zt.x, zt.y - zt.r - 12, C.or, 1, 'c');
      texte(g, 'POUR VISER', zt.x - 8, zt.y - zt.r - 3, C.or, 1, 'c');
    }
  }

  const pAppui = ui.passeActif;
  g.globalAlpha = pAppui ? 0.9 : 0.6;
  disque(g, zpa.x, zpa.y, zpa.r, C.contour);
  disque(g, zpa.x, zpa.y + (pAppui ? 1 : 0), zpa.r - 1, s.tient ? '#35c47a' : '#4f6a8c');
  g.globalAlpha = 1;
  texte(g, s.tient ? 'PASSE' : 'CHANGE', zpa.x, zpa.y - 3, C.blanc, 1, 'c');

  // petit bouton, celui des accélérations : SPRINT avec le palet (ESQUIVE quand
  // un défenseur arrive), mise en ÉCHEC sans
  const eAppui = ui.elanActif;
  const pret = s.elanCd <= 0 || (s.tient && menace);
  const clignote = menace && Math.floor(temps * 16) & 1;
  const couleur = !pret ? '#3a4060' : menace ? (clignote ? '#ffd35c' : '#ff9a4a') : s.tient ? '#3fb4e8' : '#ff9a4a';
  g.globalAlpha = eAppui || menace ? 0.95 : 0.6;
  disque(g, ze.x, ze.y, ze.r + (menace ? 2 : 0), C.contour);
  disque(g, ze.x, ze.y + (eAppui ? 1 : 0), ze.r - 1 + (menace ? 2 : 0), couleur);
  // recharge de l'élan (1 s sans le palet, plus longue avec)
  if (!pret) anneau(g, ze.x, ze.y, ze.r + 1, '#8fe3ff', 1 - Math.max(0, s.elanCd) / (s.tient ? ELAN_CD_PALET : 1), 1);
  g.globalAlpha = 1;
  texte(g, !s.tient ? 'ÉCHEC' : menace ? 'ESQUIVE' : 'SPRINT', ze.x, ze.y - 3, C.blanc, 1, 'c');
}
