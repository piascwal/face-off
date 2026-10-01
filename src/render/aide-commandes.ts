import { zoneBonus, zoneElan, zonePasse, zonePause, zoneTir } from './hud-zones';
import { largeurTexte, texte } from './pixel-font';
import { anneau, disque, ligne, px } from './primitives';
import { C } from './theme';
import { bouton, type ZoneBouton } from './widgets';

export type OngletCommandes = 'tactile' | 'clavier';

export interface EtatAideCommandes {
  onglet: OngletCommandes;
  onOnglet: (o: OngletCommandes) => void;
  onRetour: () => void;
}

const GRIS = '#6f7aa6';

/**
 * Écran « commandes » des réglages avancés : la disposition tactile
 * (miniature de l'écran de jeu, boutons à leur vraie place) ou les touches
 * du clavier, au choix par onglet.
 */
export function dessineAideCommandes(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatAideCommandes): void {
  g.fillStyle = 'rgba(7,9,20,0.86)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'COMMANDES', cx, 4, C.blanc, 1, 'c');
  const onglet = (o: OngletCommandes, label: string, x: number) => {
    const actif = etat.onglet === o;
    bouton(g, boutons, label, x, 15, 80, 13, () => etat.onOnglet(o), {
      couleur: actif ? '#2d3a8c' : '#151a38',
      texte: actif ? C.or : GRIS,
    });
  };
  onglet('tactile', 'TACTILE', cx - 84);
  onglet('clavier', 'CLAVIER', cx + 4);
  if (etat.onglet === 'tactile') dessineTactile(g, W, H, temps);
  else dessineClavier(g, W);
  bouton(g, boutons, '< RETOUR', cx - 45, H - 20, 90, 16, etat.onRetour, { couleur: '#232a58', e: 1 });
}

/** Miniature de l'écran de match avec les boutons à leur place et une étiquette par bouton. */
function dessineTactile(g: CanvasRenderingContext2D, W: number, H: number, temps: number): void {
  const k = Math.min(0.5, (H - 108) / H);
  const mw = Math.round(W * k);
  const mh = Math.round(H * k);
  const etiquettesW = 104;
  const ox = Math.round(W / 2 - (mw + 12 + etiquettesW) / 2);
  const oy = 36;
  // l'écran du téléphone
  px(g, ox - 3, oy - 3, mw + 6, mh + 6, '#2a3160');
  px(g, ox - 2, oy - 2, mw + 4, mh + 4, '#0b0e1f');
  px(g, ox, oy, mw, mh, '#16305a');
  // moitié gauche : patiner
  g.globalAlpha = 0.18;
  px(g, ox, oy, Math.round(mw * 0.45), mh, '#ffffff');
  g.globalAlpha = 1;
  const jx = ox + Math.round(mw * 0.2);
  const jy = oy + Math.round(mh * 0.62);
  const dx = Math.round(Math.cos(temps * 2) * 5);
  const dy = Math.round(Math.sin(temps * 2) * 5);
  anneau(g, jx, jy, 11, C.blanc, 1, 1);
  disque(g, jx + dx, jy + dy, 4, '#dfe8ff');
  texte(g, 'PATINER', jx, oy + 6, C.blanc, 1, 'c');
  texte(g, 'GLISSER', jx, jy + 15, GRIS, 1, 'c');

  const m = (z: { x: number; y: number }) => ({ x: ox + Math.round(z.x * k), y: oy + Math.round(z.y * k) });
  const zt = zoneTir(W, H);
  const zp = zonePasse(W, H);
  const ze = zoneElan(W, H);
  const zpa = zonePause(W);
  const zb = zoneBonus(W, H);
  const lx = ox + mw + 12;
  const etiquette = (bx: number, by: number, ly: number, col: string, titre: string, sous: string) => {
    ligne(g, bx, by, lx - 3, ly + 3, '#4a5380');
    texte(g, titre, lx, ly, col, 1, 'g');
    texte(g, sous, lx, ly + 8, GRIS, 1, 'g');
  };
  const pause = m({ x: zpa.x + zpa.w / 2, y: zpa.y + zpa.h / 2 });
  const pe = m(ze);
  const pt = m(zt);
  const pp = m(zp);
  const pb = m(zb);
  // étiquettes à hauteur de leur bouton (sans se chevaucher), traits dessinés sous les boutons
  const yE = pe.y - 7;
  const yB = Math.max(pb.y - 7, yE + 18);
  const yT = Math.max(pt.y - 7, yB + 18);
  const yP = yT + 18;
  etiquette(pause.x + 4, pause.y, pause.y - 3, C.blanc, 'PAUSE', '');
  etiquette(pe.x, pe.y, yE, '#3fb4e8', 'SPRINT', 'ESQUIVE / ECHEC');
  etiquette(pb.x, pb.y, yB, C.or, 'BONUS', 'BONUS TIR : VISER');
  etiquette(pt.x, pt.y, yT, '#ff5470', 'TIR', 'CROSSE SANS PALET');
  etiquette(pp.x, pp.y, yP, '#35c47a', 'PASSE', 'CHANGE SANS PALET');
  px(g, pause.x - 3, pause.y - 3, 2, 6, C.blanc);
  px(g, pause.x + 1, pause.y - 3, 2, 6, C.blanc);
  disque(g, pe.x, pe.y, Math.round(ze.r * k), '#3fb4e8');
  disque(g, pb.x, pb.y, Math.round(zb.r * k), '#e8a820');
  disque(g, pt.x, pt.y, Math.round(zt.r * k), '#e03a58');
  disque(g, pp.x, pp.y, Math.round(zp.r * k), '#35c47a');

  const ty = Math.max(oy + mh + 9, yP + 20);
  texte(g, 'TIR : MAINTENIR POUR CHARGER - GLISSER LE DOIGT POUR VISER', W / 2, ty, C.gris, 1, 'c');
  texte(g, 'SPRINT DEVIENT ESQUIVE QUAND UN DEFENSEUR ARRIVE', W / 2, ty + 10, C.gris, 1, 'c');
}

const TOUCHES: [string[], string, string?][] = [
  [['FLECHES', 'ZQSD'], 'PATINER'],
  [['ESPACE', 'J', 'X'], 'TIR - MAINTENIR POUR CHARGER', 'CROSSE SANS LE PALET'],
  [['L', 'V'], 'PASSE', 'CHANGER DE JOUEUR SANS LE PALET'],
  [['MAJ', 'K', 'C'], 'SPRINT - ESQUIVE', 'MISE EN ECHEC SANS LE PALET'],
  [['B', 'N'], 'BONUS QUAND IL EST PRET', 'BONUS DE TIR : COMME LE TIR'],
  [['ECHAP', 'P'], 'PAUSE'],
  [['ENTREE'], 'VALIDER / REPRENDRE'],
];

/** Liste des touches : capuchons de touches à gauche, action à droite. */
function dessineClavier(g: CanvasRenderingContext2D, W: number): void {
  const colonne = 92;
  const largeurMax = colonne + 10 + largeurTexte('CHANGER DE JOUEUR SANS LE PALET');
  const x0 = Math.round(W / 2 - largeurMax / 2);
  let y = 38;
  for (const [touches, action, detail] of TOUCHES) {
    let x = x0;
    for (const t of touches) {
      const w = largeurTexte(t) + 6;
      px(g, x, y - 2, w, 11, '#0b0e1f');
      px(g, x, y - 3, w, 11, '#3a4590');
      px(g, x + 1, y - 2, w - 2, 9, '#232a58');
      texte(g, t, x + 3, y, C.blanc, 1, 'g');
      x += w + 3;
    }
    texte(g, action, x0 + colonne + 10, y, C.blanc, 1, 'g');
    if (detail) texte(g, detail, x0 + colonne + 10, y + 9, GRIS, 1, 'g');
    y += detail ? 23 : 15;
  }
}
