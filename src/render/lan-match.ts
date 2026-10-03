/** Écrans Wi-Fi par-dessus le match et après : pause partagée, reprise, coupure, fin de match, spectateur. */

import type { StatsMatch } from '@core/types';
import { texte } from './pixel-font';
import { C } from './theme';
import { dessineStatsFin } from './screens';
import { bouton, type ZoneBouton } from './widgets';
import { BLEU, points, ROUGE } from './lan-commun';

// ======================================================== pause partagée ==

export interface EtatPauseLan {
  /** Nom du joueur qui a demandé la pause. */
  par: string;
  /** Absent pour un spectateur : seuls les joueurs relancent le match. */
  onReprendre?: () => void;
  onQuitter: () => void;
}

export function dessinePauseLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatPauseLan): void {
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'PAUSE', cx, cy - 52, C.blanc, 3, 'c');
  texte(g, `DEMANDEE PAR ${etat.par}`, cx, cy - 16, C.or, 1, 'c');
  if (etat.onReprendre) bouton(g, boutons, 'REPRENDRE', cx - 55, cy + 2, 110, 18, etat.onReprendre, BLEU);
  bouton(g, boutons, 'QUITTER LA PARTIE', cx - 55, cy + 26, 110, 18, etat.onQuitter);
}

/** Compte à rebours de reprise, pour que personne ne soit pris par surprise. */
export function dessineRepriseLan(g: CanvasRenderingContext2D, W: number, H: number, reste: number): void {
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  g.fillStyle = 'rgba(7,9,20,0.35)';
  g.fillRect(0, 0, W, H);
  texte(g, 'REPRISE', cx, cy - 30, C.blanc, 1, 'c');
  const n = Math.max(1, Math.ceil(reste));
  const f = reste - Math.floor(reste);
  texte(g, n, cx, cy - 18, C.or, f > 0.7 ? 5 : 4, 'c');
}

/** Coupure Wi-Fi en pleine partie : qui on attend, et combien de temps encore. */
export interface EtatCoupureLan {
  /** Ligne sous le titre (« EN ATTENTE DE LYNX 12 », « RECONNEXION A OURS 22 »). */
  sous: string;
  /** Secondes restantes avant d'abandonner. */
  reste: number;
  /** Bouton (ne plus attendre, quitter) ; aucun pour un spectateur. */
  bouton?: { libelle: string; act: () => void };
}

/**
 * Connexion perdue : voile sur tout l'écran (match figé, choix des équipes ou
 * écran de fin), avec le compte à rebours de la place gardée.
 */
export function dessineCoupureLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, e: EtatCoupureLan): void {
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'CONNEXION PERDUE', cx, cy - 48, '#ff8a8a', 2, 'c');
  g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 3));
  texte(g, e.sous, cx, cy - 26, C.or, 1, 'c');
  g.globalAlpha = 1;
  texte(g, Math.max(0, Math.ceil(e.reste)), cx, cy - 12, C.blanc, 3, 'c');
  texte(g, 'SECONDES', cx, cy + 12, C.gris, 1, 'c');
  if (e.bouton) bouton(g, boutons, e.bouton.libelle, cx - 60, cy + 26, 120, 18, e.bouton.act);
}

// ================================================================== fin ==

export interface EtatFinLan {
  score: [number, number];
  tirs: [number, number];
  stats: StatsMatch;
  /** Bilan cumulé contre cet adversaire (mis à jour avec ce match). */
  bilan: string | null;
  prolong: boolean;
  moi: 0 | 1;
  monVote: 'rejouer' | 'equipes' | null;
  /** Les autres joueurs et leur vote. */
  autres: { nom: string; vote: 'rejouer' | 'equipes' | null }[];
  onVote: (v: 'rejouer' | 'equipes' | null) => void;
  onQuitter: () => void;
}

/** Fin de match en réseau : on ne relance que si les deux joueurs votent la même chose. */
export function dessineFinLan(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFinLan): void {
  g.fillStyle = 'rgba(7,9,20,0.5)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  // panneau sombre derrière le bilan : lisible par-dessus l'image de victoire / défaite
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(cx - 142, cy - 94, 284, 158);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(cx - 142, cy - 94, 284, 1);
  g.fillRect(cx - 142, cy + 63, 284, 1);
  const eux = fin.moi === 0 ? 1 : 0;
  const gagne = fin.score[fin.moi] > fin.score[eux];
  const nul = fin.score[0] === fin.score[1];
  const titre = nul ? 'MATCH NUL' : gagne ? 'VICTOIRE !' : 'DEFAITE';
  texte(g, titre, cx, cy - 75 + Math.round(Math.sin(temps * 4) * 1.5), gagne ? C.or : nul ? C.blanc : '#ff6b6b', 3, 'c');
  texte(g, `${fin.score[0]} - ${fin.score[1]}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 50, C.blanc, 2, 'c');
  dessineStatsFin(g, cx, cy - 31, fin.tirs, fin.stats);

  const choix = (v: 'rejouer' | 'equipes', label: string, x: number, w: number, style: typeof ROUGE) => {
    const choisi = fin.monVote === v;
    bouton(g, boutons, choisi ? `> ${label} <` : label, x, cy + 17, w, 18, () => fin.onVote(choisi ? null : v), choisi ? style : { couleur: '#232a58' });
  };
  choix('rejouer', 'REJOUER', cx - 124, 110, ROUGE);
  choix('equipes', "CHANGER D'EQUIPES", cx + 4, 120, BLEU);

  const lib = (v: 'rejouer' | 'equipes' | null) => (v === 'rejouer' ? 'VEUT REJOUER' : v === 'equipes' ? "VEUT CHANGER D'EQUIPES" : `REFLECHIT${points(temps)}`);
  // un joueur par ligne (trois autres au plus) ; avec plus d'un, on les resserre
  const pasLigne = fin.autres.length > 1 ? 9 : 10;
  fin.autres.forEach((a, i) => texte(g, `${a.nom} ${lib(a.vote)}`, cx, cy + 40 + i * pasLigne, a.vote ? C.or : C.gris, 1, 'c'));
  const yBilan = cy + 40 + Math.max(1, fin.autres.length) * pasLigne;
  if (fin.monVote && fin.autres.some((a) => a.vote && a.vote !== fin.monVote)) {
    texte(g, 'VOUS N\'ETES PAS D\'ACCORD : CHOISISSEZ LA MEME OPTION', cx, yBilan, '#ff9a5c', 1, 'c');
  } else if (fin.monVote && fin.autres.some((a) => !a.vote)) {
    texte(g, 'ON RELANCE DES QUE VOUS ETES D\'ACCORD', cx, yBilan, '#6f7aa6', 1, 'c');
  }
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, fin.onQuitter, { couleur: '#232a58' });
  if (fin.bilan) texte(g, fin.bilan, W - 6, H - 17, '#6f7aa6', 1, 'd');
}

// ============================================================ spectateur ==

export interface EtatAttenteSpectateur {
  /** Noms des joueurs de chaque camp. */
  camps: [string[], string[]];
  /** Ce que font les joueurs en ce moment. */
  sous: string;
  spect: number;
  onQuitter: () => void;
}

/** Spectateur hors match (salle d'attente, choix des équipes, entre deux matchs). */
export function dessineAttenteSpectateur(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatAttenteSpectateur): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  texte(g, 'MODE SPECTATEUR', cx, cy - 58, '#8fe3ff', 2, 'c');
  texte(g, `${etat.camps[0].join(' + ') || '...'}  VS  ${etat.camps[1].join(' + ') || 'CPU'}`, cx, cy - 26, C.blanc, 1, 'c');
  g.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(temps * 2.5));
  texte(g, `${etat.sous}${points(temps)}`, cx, cy - 8, C.or, 1, 'c');
  g.globalAlpha = 1;
  texte(g, 'LE MATCH S\'AFFICHE DES QU\'IL COMMENCE', cx, cy + 8, '#6f7aa6', 1, 'c');
  if (etat.spect > 1) texte(g, `${etat.spect} SPECTATEURS`, cx, cy + 22, '#6f7aa6', 1, 'c');
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, etat.onQuitter, { couleur: '#232a58' });
}

export interface EtatFinSpectateur {
  score: [number, number];
  tirs: [number, number];
  stats: StatsMatch;
  prolong: boolean;
  noms: [string, string];
  onQuitter: () => void;
}

/** Fin de match vue par un spectateur : le score et les statistiques, sans vote. */
export function dessineFinSpectateur(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, fin: EtatFinSpectateur): void {
  g.fillStyle = 'rgba(7,9,20,0.5)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(cx - 142, cy - 94, 284, 158);
  const [a, b] = fin.score;
  const vainqueur = a === b ? null : a > b ? fin.noms[0] : fin.noms[1];
  texte(g, 'FIN DU MATCH', cx, cy - 75 + Math.round(Math.sin(temps * 4) * 1.5), C.or, 3, 'c');
  texte(g, `${a} - ${b}${fin.prolong ? '  PROL.' : ''}`, cx, cy - 50, C.blanc, 2, 'c');
  dessineStatsFin(g, cx, cy - 31, fin.tirs, fin.stats);
  texte(g, vainqueur ? `VICTOIRE DE ${vainqueur}` : 'MATCH NUL', cx, cy + 22, C.blanc, 1, 'c');
  texte(g, `LES JOUEURS VOTENT POUR LA SUITE${points(temps)}`, cx, cy + 36, '#6f7aa6', 1, 'c');
  bouton(g, boutons, 'QUITTER', 4, H - 22, 66, 16, fin.onQuitter, { couleur: '#232a58' });
}
