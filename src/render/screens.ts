import { DUREES, EFFECTIFS, NIVEAUX } from '@core/constants';
import type { Rink, StatsMatch } from '@core/types';
import type { Banniere } from './effects';
import { obtientLogo } from './logos';
import { largeurTexte, texte } from './pixel-font';
import { bouton, panneau, type ZoneBouton } from './widgets';
import { C, MARQUE } from './theme';
import type { EquipeVisuelle } from './team-visuals';

export interface EtatMenu {
  niveauIdx: number;
  dureeIdx: number;
  effectifIdx: number;
  son: boolean;
  victoires: number;
  matchs: number;
  tactile: boolean;
  /** Numéro de version de l'app, en petit en bas à droite. */
  version: string;
  onNiveau: () => void;
  onDuree: () => void;
  onEffectif: () => void;
  onSon: () => void;
  onJouer: () => void;
  onReseau: () => void;
  onAvance: () => void;
}

export function dessineMenu(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, menu: EtatMenu): void {
  g.fillStyle = 'rgba(7,9,20,0.45)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const t = temps;
  const titre = 'FACE-OFF';
  const e = W > 300 ? 4 : 3;
  const lw = largeurTexte(titre, e);
  const ox = cx - lw / 2;
  const ty = Math.max(6, Math.round(H * 0.05));
  for (let i = 0; i < titre.length; i++) {
    const dy = Math.round(Math.sin(t * 3 + i * 0.6) * 1.5);
    const col = i < 4 ? MARQUE.bleu : i === 4 ? C.blanc : MARQUE.rouge;
    texte(g, titre[i]!, ox + i * 6 * e + 2.5 * e, ty + dy, col, e, 'c');
  }
  texte(g, 'HOCKEY ARCADE', cx, ty + 7 * e + 5, C.or, 1, 'c');

  const pw = 186;
  const ph = 122;
  const py = ty + 7 * e + 16;
  panneau(g, cx - pw / 2, py, pw, ph);
  const lignes: [string, string, () => void][] = [
    ['NIVEAU', NIVEAUX[menu.niveauIdx]!.nom, menu.onNiveau],
    ['DUREE', `${DUREES[menu.dureeIdx]! / 60} MIN`, menu.onDuree],
    ['EQUIPES', `${EFFECTIFS[menu.effectifIdx]} CONTRE ${EFFECTIFS[menu.effectifIdx]}`, menu.onEffectif],
    ['SON', menu.son ? 'OUI' : 'NON', menu.onSon],
  ];
  lignes.forEach(([k, v, act], i) => {
    const y = py + 5 + i * 15;
    texte(g, k, cx - pw / 2 + 10, y + 4, C.gris, 1, 'g');
    bouton(g, boutons, `< ${v} >`, cx - 14, y, 98, 13, act, { couleur: '#232a58' });
  });
  const jy = py + 68;
  const pulse = Math.sin(t * 5) > 0;
  bouton(g, boutons, 'JOUER', cx - 88, jy, 84, 22, menu.onJouer, {
    e: 2,
    couleur: pulse ? '#e63a58' : '#d12f4c',
    clair: '#ff7a90',
    fonce: '#8c1b3a',
  });
  bouton(g, boutons, 'MULTI WIFI', cx + 4, jy, 84, 22, menu.onReseau, { couleur: '#1f7fb3', clair: '#6fd0ff', fonce: '#0f4d73' });
  bouton(g, boutons, 'REGLAGES AVANCES', cx - 60, jy + 28, 120, 13, menu.onAvance, { couleur: '#232a58' });
  const bas = py + ph + 6;
  texte(g, menu.version, W - 3, H - 9, '#4a5380', 1, 'd');
  if (bas + 8 < H) texte(g, menu.matchs ? `VICTOIRES ${menu.victoires} / ${menu.matchs}` : 'PREMIER MATCH ?', cx, bas, C.gris, 1, 'c');
  if (bas + 20 < H) {
    texte(
      g,
      menu.tactile ? 'GAUCHE : PATINER   DROITE : TIR / PASSE / CHECK' : 'FLECHES  ESPACE : TIR  L : PASSE  MAJ : CHECK',
      cx,
      bas + 11,
      '#6f7aa6',
      1,
      'c',
    );
  }
}

export interface EtatAvance {
  assistTir: boolean;
  assistPasse: boolean;
  changementAuto: boolean;
  secoussesReduites: boolean;
  ralentiButs: boolean;
  onAssistTir: () => void;
  onAssistPasse: () => void;
  onChangementAuto: () => void;
  onSecousses: () => void;
  onRalenti: () => void;
  onRetour: () => void;
}

/**
 * Écran « réglages avancés » — assistance de tir/passe et changement de
 * joueur automatique modulent la simulation pour de vrai (voir
 * `core/humanControl.ts`, `core/actions.ts`), pas juste l'affichage.
 */
export function dessineAvance(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, menu: EtatAvance): void {
  g.fillStyle = 'rgba(7,9,20,0.82)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'REGLAGES AVANCES', cx, 4, C.blanc, 1, 'c');

  const pw = 210;
  const ph = 100;
  const py = Math.round(H * 0.18);
  panneau(g, cx - pw / 2, py, pw, ph);
  const lignes: [string, string, () => void][] = [
    ['ASSISTANCE TIR', menu.assistTir ? 'OUI' : 'NON', menu.onAssistTir],
    ['ASSISTANCE PASSE', menu.assistPasse ? 'OUI' : 'NON', menu.onAssistPasse],
    ['CHGT AUTO JOUEUR', menu.changementAuto ? 'OUI' : 'NON', menu.onChangementAuto],
    ['SECOUSSES ECRAN', menu.secoussesReduites ? 'REDUITES' : 'NORMALES', menu.onSecousses],
    ['RALENTI DES BUTS', menu.ralentiButs ? 'OUI' : 'NON', menu.onRalenti],
  ];
  lignes.forEach(([k, v, act], i) => {
    const y = py + 6 + i * 17;
    texte(g, k, cx - pw / 2 + 10, y + 4, C.gris, 1, 'g');
    bouton(g, boutons, `< ${v} >`, cx + pw / 2 - 106, y, 96, 13, act, { couleur: '#232a58' });
  });
  texte(g, 'CHANGE VRAIMENT LA PARTIE, PAS JUSTE L\'AFFICHAGE', cx, py + ph + 8, '#6f7aa6', 1, 'c');
  bouton(g, boutons, '< RETOUR', cx - 45, py + ph + 20, 90, 16, menu.onRetour, { couleur: '#232a58', e: 1 });
}

export function dessinePause(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  W: number,
  H: number,
  onReprendre: () => void,
  onAbandonner: () => void,
): void {
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'PAUSE', cx, cy - 40, C.blanc, 3, 'c');
  bouton(g, boutons, 'REPRENDRE', cx - 55, cy - 6, 110, 18, onReprendre, { couleur: '#1f7fb3', clair: '#6fd0ff', fonce: '#0f4d73' });
  bouton(g, boutons, 'ABANDONNER', cx - 55, cy + 18, 110, 18, onAbandonner);
}

/** Tableau de statistiques de fin de match : valeur de l'équipe 0 à gauche, de l'équipe 1 à droite. */
export function dessineStatsFin(g: CanvasRenderingContext2D, cx: number, y: number, tirs: [number, number], s: StatsMatch): void {
  const total = s.possession[0] + s.possession[1];
  const pct = (i: 0 | 1) => (total > 0 ? `${Math.round((s.possession[i] / total) * 100)}%` : '-');
  const lignes: [string, string, string][] = [
    ['TIRS CADRES', String(tirs[0]), String(tirs[1])],
    ['PASSES', String(s.passes[0]), String(s.passes[1])],
    ['POSSESSION', pct(0), pct(1)],
    ['MISES EN ECHEC', String(s.checks[0]), String(s.checks[1])],
    ['MEILLEURE COMBO', `X${s.comboMax[0]}`, `X${s.comboMax[1]}`],
  ];
  lignes.forEach(([k, a, b], i) => {
    const yy = y + i * 9;
    texte(g, a, cx - 62, yy, C.blanc, 1, 'd');
    texte(g, k, cx, yy, C.gris, 1, 'c');
    texte(g, b, cx + 62, yy, C.blanc, 1, 'g');
  });
}

export interface EtatFin {
  score: [number, number];
  tirs: [number, number];
  stats: StatsMatch;
  prolong: boolean;
  niveauNom: string;
  victoires: number;
  matchs: number;
  equipes: [EquipeVisuelle, EquipeVisuelle];
  onRejouer: () => void;
  onMenu: () => void;
}

export function dessineFin(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFin): void {
  g.fillStyle = 'rgba(7,9,20,0.74)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  const gagne = fin.score[0] > fin.score[1];
  const t = temps;
  const titre = gagne ? 'VICTOIRE !' : 'DEFAITE';
  texte(g, titre, cx, cy - 75 + Math.round(Math.sin(t * 4) * 1.5), gagne ? C.or : fin.equipes[1].maillot, 3, 'c');
  texte(g, `${fin.score[0]} - ${fin.score[1]}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 50, C.blanc, 2, 'c');
  dessineStatsFin(g, cx, cy - 31, fin.tirs, fin.stats);
  bouton(g, boutons, 'REJOUER', cx - 108, cy + 17, 100, 20, fin.onRejouer, { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
  bouton(g, boutons, 'MENU', cx + 8, cy + 17, 100, 20, fin.onMenu);
  texte(g, `NIVEAU ${fin.niveauNom}   VICTOIRES ${fin.victoires} / ${fin.matchs}`, cx, cy + 45, '#6f7aa6', 1, 'c');
}

export function dessineBanniere(g: CanvasRenderingContext2D, W: number, rink: Rink, banniere: Banniere | null, ecranUI: string): void {
  if (!banniere || ecranUI === 'menu') return;
  const b = banniere;
  const age = b.max - b.vie;
  const e = b.txt.length > 9 ? 2 : 3;
  const entree = Math.min(1, age * 6);
  const cx = Math.round(W / 2);
  const cy = Math.round(rink.cy - 12);
  const bandeH = 7 * e + (b.sous ? 18 : 10);
  g.globalAlpha = Math.min(1, b.vie * 3) * 0.75;
  g.fillStyle = '#070914';
  const bw = Math.round(W * entree);
  g.fillRect(cx - bw / 2, cy - 6, bw, bandeH);
  g.fillStyle = b.c;
  g.fillRect(cx - bw / 2, cy - 6, bw, 1);
  g.fillRect(cx - bw / 2, cy - 7 + bandeH, bw, 1);
  g.globalAlpha = Math.min(1, b.vie * 3);
  const dx = Math.round((1 - entree) * 60);
  texte(g, b.txt, cx - dx, cy, b.c, e, 'c');
  if (b.sous) texte(g, b.sous, cx + dx, cy + 7 * e + 4, C.blanc, 1, 'c');
  g.globalAlpha = 1;
}

/**
 * Écusson géant de l'équipe qui marque, entre la patinoire et le bandeau
 * « BUT ! » : entrée avec rebond (easeOutBack), légère respiration, fondu en
 * sortie. La patinoire est assombrie derrière pour que l'écusson ressorte.
 */
export function dessineLogoBut(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  rink: Rink,
  banniere: Banniere | null,
  ecranUI: string,
  temps: number,
): void {
  if (!banniere?.logoId || ecranUI === 'menu') return;
  const logo = obtientLogo(banniere.logoId);
  if (!logo) return;
  const age = banniere.max - banniere.vie;
  const opacite = Math.min(1, banniere.vie * 2.5, age * 8);

  g.globalAlpha = opacite * 0.45;
  g.fillStyle = '#070914';
  g.fillRect(0, 0, W, H);

  const c1 = 1.70158;
  const c3 = c1 + 1;
  const tt = Math.min(1, age / 0.45);
  const rebond = 1 + c3 * Math.pow(tt - 1, 3) + c1 * Math.pow(tt - 1, 2);
  const respiration = 1 + Math.sin(temps * 6) * 0.02 * tt;
  const taille = Math.round(H * 0.9 * Math.max(0, rebond) * respiration);
  g.globalAlpha = opacite;
  g.imageSmoothingEnabled = true;
  g.drawImage(logo, Math.round(W / 2 - taille / 2), Math.round(rink.cy - taille / 2), taille, taille);
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
}

export function dessinePortrait(g: CanvasRenderingContext2D, W: number, H: number, temps: number): void {
  g.fillStyle = C.nuit;
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  const t = temps;
  const a = ((Math.sin(t * 2) * 0.5 + 0.5) * Math.PI) / 2;
  g.save();
  g.translate(cx, cy - 30);
  g.rotate(-a);
  g.fillStyle = C.contour;
  g.fillRect(-15, -26, 30, 52);
  g.fillStyle = '#b6c2e0';
  g.fillRect(-14, -25, 28, 50);
  g.fillStyle = '#3a8fd1';
  g.fillRect(-12, -21, 24, 40);
  g.fillStyle = '#e8f6ff';
  g.fillRect(-10, -19, 20, 36);
  g.fillStyle = C.rouge;
  g.fillRect(-1, -19, 2, 36);
  g.restore();
  texte(g, 'TOURNEZ', cx, cy + 20, C.blanc, 2, 'c');
  texte(g, 'VOTRE TELEPHONE', cx, cy + 40, C.or, 1, 'c');
  texte(g, 'LE MATCH SE JOUE', cx, cy + 58, C.gris, 1, 'c');
  texte(g, 'EN PAYSAGE', cx, cy + 68, C.gris, 1, 'c');
}

export interface EtatRalenti {
  progression: number;
  /** En Wi-Fi, après avoir passé : on attend que l'autre passe aussi. */
  attente: string | null;
  onPasser: () => void;
}

/** Bandeau du ralenti de but : repère « RALENTI », avancement et bouton PASSER. */
export function dessineRalenti(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, r: EtatRalenti): void {
  const y = H - 22;
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(0, y - 2, W, 24);
  if (Math.floor(temps * 2) % 2 === 0) {
    g.fillStyle = '#ff4a4a';
    g.fillRect(8, y + 5, 5, 5);
  }
  texte(g, 'RALENTI', 17, y + 4, C.blanc, 1, 'g');
  const bx = 70;
  const bw = W - bx - 90;
  g.fillStyle = '#2a3160';
  g.fillRect(bx, y + 7, bw, 2);
  g.fillStyle = C.or;
  g.fillRect(bx, y + 7, Math.round(bw * r.progression), 2);
  if (r.attente) texte(g, r.attente, W - 6, y + 4, C.or, 1, 'd');
  else bouton(g, boutons, 'PASSER >', W - 78, y, 72, 16, r.onPasser, { couleur: '#232a58' });
}
