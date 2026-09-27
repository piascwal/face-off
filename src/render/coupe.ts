import { niveauInterpole } from '@core/constants';
import { champion, coupeTerminee, NB_TOURS, niveauDuTour, NOMS_TOURS, vainqueur, type EtatCoupe, type MatchCoupe } from '@core/coupe';
import { obtientLogo } from './logos';
import { largeurTexte, texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { dessinePanneauEquipe, dessinePanneauMaillot, type CarteEquipe, type CoteMaillot } from './team-select';
import { C } from './theme';
import { trouveTeamDef, type Palette, type TeamDef, type Variante } from './team-visuals';
import { bouton, type ZoneBouton } from './widgets';

/**
 * Écrans du mode coupe : choix de l'équipe, puis le tableau (quarts à gauche
 * et à droite, demi-finales, finale au centre avec le trophée). Après chaque
 * match du joueur, les résultats du tour se dévoilent un à un et les
 * vainqueurs avancent dans le tableau.
 */

/** Rythme du dévoilement des résultats (s) : attente avant le premier, puis entre deux. */
export const REVELATION = { debut: 0.5, pas: 0.55, eclat: 0.45 };

// ------------------------------------------------------------ dévoilement --

export type Etape = { k: 'score'; t: number; i: number } | { k: 'tour'; t: number };

/**
 * Étapes du dévoilement des tours qui viennent de se jouer : les scores (le
 * match du joueur d'abord), puis le tirage du tour suivant.
 */
export function etapesRevelation(c: EtatCoupe, tours: number[]): Etape[] {
  const etapes: Etape[] = [];
  for (const t of tours) {
    const ms = c.tours[t] ?? [];
    const ordre = ms.map((_, i) => i);
    const j = ms.findIndex((m) => m.a === c.equipe || m.b === c.equipe);
    if (j > 0) ordre.unshift(...ordre.splice(j, 1));
    for (const i of ordre) etapes.push({ k: 'score', t, i });
    if (t + 1 < NB_TOURS) etapes.push({ k: 'tour', t: t + 1 });
  }
  return etapes;
}

export interface Revelation {
  etapes: Etape[];
  /** Début du dévoilement (s), null tant que le tableau n'est pas à l'écran. */
  t0: number | null;
}

/** Nombre d'étapes déjà dévoilées à l'instant `t`. */
export function etapesVues(r: Revelation, t: number): number {
  if (r.t0 === null) return 0;
  return Math.max(0, Math.min(r.etapes.length, Math.floor((t - r.t0 - REVELATION.debut) / REVELATION.pas) + 1));
}

// ------------------------------------------------------------- maillots --

const rvb = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
function ecart(a: string, b: string): number {
  const [r1, g1, b1] = rvb(a);
  const [r2, g2, b2] = rvb(b);
  return Math.hypot(r1! - r2!, g1! - g2!, b1! - b2!);
}

/** Maillot de l'adversaire : domicile, sauf s'il se confond avec celui du joueur. */
export function varianteAdverse(joueur: Palette, adv: TeamDef): Variante {
  const d = ecart(joueur.maillot, adv.interieur.maillot);
  if (d >= 110) return 'interieur';
  return ecart(joueur.maillot, adv.exterieur.maillot) > d ? 'exterieur' : 'interieur';
}

// ------------------------------------------------------- choix de l'équipe --

export interface EtatChoixCoupe {
  carte: CarteEquipe;
  maillot: CoteMaillot;
  onPrecedent: () => void;
  onSuivant: () => void;
  onMaillot: () => void;
  onRetour: () => void;
  onLancer: () => void;
}

/** Une seule équipe à choisir (les adversaires sont tirés au sort) : l'équipe à gauche, son maillot à droite. */
export function dessineChoixCoupe(g: CanvasRenderingContext2D, boutons: ZoneBouton[], sprites: BanqueSprites, W: number, H: number, e: EtatChoixCoupe): void {
  g.fillStyle = 'rgba(7,9,20,0.78)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'COUPE : VOTRE EQUIPE', cx, 2, C.or, 1, 'c');
  const moitie = Math.floor(W / 2);
  const boutonY = H - 22;
  px(g, moitie - 1, 12, 1, boutonY - 16, '#2a3160');
  dessinePanneauEquipe(g, boutons, 0, moitie, H, 'EQUIPE', e.carte, e.onPrecedent, e.onSuivant);
  dessinePanneauMaillot(g, boutons, sprites, moitie, W - moitie, H, 'MAILLOT', e.maillot, false, e.onMaillot);
  bouton(g, boutons, '< RETOUR', 4, boutonY, 60, 16, e.onRetour, { couleur: '#232a58', e: 1 });
  bouton(g, boutons, 'LANCER LA COUPE', cx - 60, boutonY, 120, 16, e.onLancer, { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
}

// -------------------------------------------------------------- tableau --

let trophee: HTMLImageElement | null = null;
function imageTrophee(): HTMLImageElement | null {
  if (!trophee) {
    trophee = new Image();
    trophee.src = `${import.meta.env.BASE_URL}coupe.png`;
  }
  return trophee.complete && trophee.naturalWidth ? trophee : null;
}

export interface EtatTableauCoupe {
  coupe: EtatCoupe;
  revelation: Revelation | null;
  /** Demande de confirmation de l'abandon en cours. */
  confirmeAbandon: boolean;
  onJouer: () => void;
  onAbandonner: () => void;
  onNouvelle: () => void;
  onMenu: () => void;
  onPasser: () => void;
}

interface Case {
  eq: string | null;
  score: number | null;
  moi: boolean;
  /** Vainqueur / perdant du match (une fois le score connu). */
  gagne: boolean;
  perdu: boolean;
  /** Éclat du dévoilement (0..1). */
  eclat: number;
}

const BH = 11;

function dessineCase(g: CanvasRenderingContext2D, x: number, y: number, w: number, c: Case): void {
  px(g, x, y, w, BH, c.perdu ? '#12152c' : '#1c2350');
  const bord = c.moi ? C.or : '#465090';
  px(g, x, y, w, 1, bord);
  px(g, x, y + BH - 1, w, 1, bord);
  px(g, x, y, 1, BH, bord);
  px(g, x + w - 1, y, 1, BH, bord);
  if (!c.eq) {
    texte(g, '...', x + w / 2, y + 2, '#5a64a0', 1, 'c');
    return;
  }
  const def = trouveTeamDef(c.eq);
  const logo = obtientLogo(def.id);
  if (logo) {
    g.globalAlpha = c.perdu ? 0.4 : 1;
    g.imageSmoothingEnabled = true;
    g.drawImage(logo, x + 2, y + 1, 9, 9);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
  }
  const col = c.perdu ? '#6e7396' : C.blanc;
  // le nom s'arrête 4 px avant le score (écran étroit : il est tronqué)
  const place = w - 17 - (c.score !== null ? largeurTexte(String(c.score)) + 4 : 0);
  const nom = def.code.slice(0, Math.max(1, Math.floor((place + 1) / 6)));
  texte(g, nom, x + 13, y + 2, col, 1, 'g');
  if (c.score !== null) texte(g, String(c.score), x + w - 3, y + 2, c.gagne ? C.or : col, 1, 'd');
  if (c.eclat > 0) {
    g.globalAlpha = c.eclat * 0.45;
    px(g, x, y, w, BH, C.blanc);
    g.globalAlpha = 1;
  }
}

/** Trait de liaison en équerre entre deux cases (de (x1, y1) vers (x2, y2)). */
function liaison(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, col: string): void {
  const xm = Math.round((x1 + x2) / 2);
  const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
  const [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1];
  if (x1 < x2) {
    px(g, a, y1, xm - a + 1, 1, col);
    px(g, xm, y2, b - xm, 1, col);
  } else {
    px(g, xm, y1, b - xm, 1, col);
    px(g, a, y2, xm - a + 1, 1, col);
  }
  px(g, xm, ya, 1, yb - ya + 1, col);
}

/** Tour où le joueur a été éliminé (ou -1). */
function tourElimination(c: EtatCoupe): number {
  return c.tours.findIndex((l) => l.some((m) => (m.a === c.equipe || m.b === c.equipe) && vainqueur(m) !== null && vainqueur(m) !== c.equipe));
}

const LIBELLES_JOUER = ['JOUER LE QUART >', 'JOUER LA DEMI >', 'JOUER LA FINALE >'];
const ELIMINE_EN = ['EN QUARTS', 'EN DEMI-FINALE', 'EN FINALE'];

export function dessineTableauCoupe(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, e: EtatTableauCoupe): void {
  g.fillStyle = 'rgba(7,9,20,0.9)';
  g.fillRect(0, 0, W, H);
  const c = e.coupe;
  const cx = Math.round(W / 2);

  // ce qui est déjà dévoilé : scores masqués et tours pas encore tirés
  const rev = e.revelation;
  const n = rev ? etapesVues(rev, temps) : 0;
  const enCours = !!rev && n < rev.etapes.length;
  const masqueScore = new Set<string>();
  const masqueTour = new Set<number>();
  const eclats = new Map<string, number>();
  rev?.etapes.forEach((et, k) => {
    const cle = et.k === 'score' ? `s${et.t}:${et.i}` : `t${et.t}`;
    if (k >= n) {
      if (et.k === 'score') masqueScore.add(cle);
      else masqueTour.add(et.t);
    } else if (rev.t0 !== null) {
      const age = temps - (rev.t0 + REVELATION.debut + k * REVELATION.pas);
      if (age < REVELATION.eclat) eclats.set(cle, 1 - age / REVELATION.eclat);
    }
  });

  // en-tête
  texte(g, 'COUPE FACE-OFF', cx, 3, C.or, 2, 'c');
  const ch = champion(c);
  let sous: string;
  let colSous = '#8fe3ff';
  if (enCours) {
    const et = rev!.etapes[Math.min(n, rev!.etapes.length - 1)]!;
    sous = et.k === 'score' ? `RESULTATS : ${NOMS_TOURS[et.t]}` : `TIRAGE : ${NOMS_TOURS[et.t]}`;
  } else if (!coupeTerminee(c)) {
    sous = `${NOMS_TOURS[c.tour]}  -  NIVEAU ${niveauInterpole(niveauDuTour(c)).nom}`;
  } else if (ch === c.equipe) {
    sous = 'CHAMPION DE LA COUPE !';
    colSous = Math.sin(temps * 6) > 0 ? C.or : C.blanc;
  } else {
    const t = tourElimination(c);
    sous = `ELIMINE ${ELIMINE_EN[Math.max(0, t)]}  -  VAINQUEUR : ${ch ? trouveTeamDef(ch).code : '?'}`;
    colSous = '#ff8a8a';
  }
  texte(g, sous, cx, 21, colSous, 1, 'c');

  // géométrie : cinq colonnes (quarts, demies, finale, demies, quarts)
  const cg = Math.max(6, Math.min(14, Math.floor(W * 0.025)));
  const bw = Math.min(92, Math.floor((W - 8 - 4 * cg) / 5));
  const x0 = Math.round((W - (5 * bw + 4 * cg)) / 2);
  const col = (k: number) => x0 + k * (bw + cg);
  const haut = 32;
  const bas = H - 24;
  const A = bas - haut;
  const hMatch = 2 * BH + 1;

  const caseDe = (t: number, i: number, cote: 'a' | 'b'): Case => {
    const m: MatchCoupe | undefined = masqueTour.has(t) ? undefined : c.tours[t]?.[i];
    const eq = m ? m[cote] : null;
    const cache = masqueScore.has(`s${t}:${i}`);
    const s = m && !cache ? (cote === 'a' ? m.sa : m.sb) : null;
    const v = m && !cache ? vainqueur(m) : null;
    const eclat = Math.max(eclats.get(`s${t}:${i}`) ?? 0, eclats.get(`t${t}`) ?? 0);
    return { eq, score: s, moi: eq === c.equipe, gagne: !!v && v === eq, perdu: !!v && v !== eq, eclat };
  };
  const trait = '#4a5490';

  // un match = deux cases l'une sous l'autre ; renvoie le centre vertical de chaque case
  const match = (x: number, yc: number, t: number, i: number): [number, number] => {
    const y = Math.round(yc - hMatch / 2);
    dessineCase(g, x, y, bw, caseDe(t, i, 'a'));
    dessineCase(g, x, y + BH + 1, bw, caseDe(t, i, 'b'));
    return [y + Math.floor(BH / 2), y + BH + 1 + Math.floor(BH / 2)];
  };

  // quarts : 0 et 1 à gauche, 2 et 3 à droite ; demi 0 à gauche, 1 à droite
  const yq = [haut + A * 0.25, haut + A * 0.75];
  const ys = haut + A * 0.5;
  const yf = haut + Math.max(A * 0.2, 18);
  const [sa0, sb0] = match(col(1), ys, 1, 0);
  const [sa1, sb1] = match(col(3), ys, 1, 1);
  for (let k = 0; k < 2; k++) {
    match(col(0), yq[k]!, 0, k);
    liaison(g, col(0) + bw, Math.round(yq[k]!), col(1) - 1, k === 0 ? sa0 : sb0, trait);
    match(col(4), yq[k]!, 0, 2 + k);
    liaison(g, col(4) - 1, Math.round(yq[k]!), col(3) + bw, k === 0 ? sa1 : sb1, trait);
  }
  const [fa, fb] = match(col(2), yf, 2, 0);
  liaison(g, col(1) + bw, Math.round(ys), col(2) - 1, fa, trait);
  liaison(g, col(3) - 1, Math.round(ys), col(2) + bw, fb, trait);
  texte(g, 'FINALE', col(2) + bw / 2, Math.round(yf - hMatch / 2) - 9, C.or, 1, 'c');

  // le trophée sous la finale, qui scintille pour le champion
  const img = imageTrophee();
  const hautT = Math.round(yf + hMatch / 2) + 5;
  const hT = Math.min(img?.naturalHeight ?? 107, bas - hautT);
  if (img && hT > 20) {
    const wT = Math.round((img.naturalWidth * hT) / img.naturalHeight);
    const gagneCoupe = !enCours && ch === c.equipe;
    const dy = gagneCoupe ? Math.round(Math.sin(temps * 3) * 2) : 0;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(cx - wT / 2), hautT + dy, wT, hT);
    if (gagneCoupe) {
      for (let k = 0; k < 6; k++) {
        const u = (temps * 0.9 + k / 6) % 1;
        const sx = cx + Math.sin(k * 2.4) * wT * 0.7;
        const sy = hautT + dy + hT * (0.15 + ((k * 0.37) % 0.6));
        g.globalAlpha = Math.sin(u * Math.PI);
        px(g, Math.round(sx) - 1, Math.round(sy), 3, 1, C.blanc);
        px(g, Math.round(sx), Math.round(sy) - 1, 1, 3, C.blanc);
      }
      g.globalAlpha = 1;
    }
  }

  // boutons
  const by = H - 19;
  if (enCours) {
    texte(g, 'TOUCHER POUR PASSER', cx, by + 4, '#6f7aa6', 1, 'c');
    boutons.push({ x: 0, y: 0, w: W, h: H, act: e.onPasser });
    return;
  }
  bouton(g, boutons, 'MENU', W - 54, by, 50, 15, e.onMenu, { couleur: '#232a58' });
  if (coupeTerminee(c)) {
    bouton(g, boutons, 'NOUVELLE COUPE', cx - 60, by, 120, 15, e.onNouvelle, { couleur: '#d12f4c', clair: '#ff7a90', fonce: '#8c1b3a' });
    return;
  }
  bouton(g, boutons, e.confirmeAbandon ? 'CONFIRMER ?' : 'ABANDONNER', 4, by, 74, 15, e.onAbandonner, {
    couleur: e.confirmeAbandon ? '#8c1b3a' : '#232a58',
  });
  const pulse = Math.sin(temps * 5) > 0;
  bouton(g, boutons, LIBELLES_JOUER[c.tour]!, cx - 60, by, 120, 15, e.onJouer, {
    couleur: pulse ? '#e63a58' : '#d12f4c',
    clair: '#ff7a90',
    fonce: '#8c1b3a',
  });
}
