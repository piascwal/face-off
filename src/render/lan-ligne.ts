/** Écrans du multijoueur d'avant la salle d'attente : le choix du mode, et l'accueil du jeu en ligne. */

import { texte } from './pixel-font';
import { C } from './theme';
import { bouton, panneau, type ZoneBouton } from './widgets';
import { BLEU, points } from './lan-commun';

const SOMBRE = { couleur: '#232a58' };
const VERT_BTN = { couleur: '#24995c', clair: '#5fe0a0', fonce: '#14603a' };

/** Le pseudo, touchable pour le changer : il s'affiche aux autres joueurs. */
export function dessinePseudo(g: CanvasRenderingContext2D, boutons: ZoneBouton[], cx: number, y: number, pseudo: string, onPseudo: () => void): void {
  texte(g, 'PSEUDO', cx - 70, y + 3, C.gris, 1, 'g');
  bouton(g, boutons, `${pseudo} >`, cx - 22, y, 92, 12, onPseudo, { couleur: '#232a58', texte: C.or });
}

export interface EtatMulti {
  pseudo: string;
  onLigne: () => void;
  onLocal: () => void;
  onPseudo: () => void;
  onRetour: () => void;
}

/** Écran « MULTIJOUEUR » : en ligne (code de salon) ou sur le même Wi-Fi. */
export function dessineMulti(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatMulti): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'MULTIJOUEUR', cx, 6, C.blanc, 2, 'c');
  dessinePseudo(g, boutons, cx, 28, etat.pseudo, etat.onPseudo);
  // deux boutons de même taille, à la largeur d'un bouton
  const bw = 130;
  const bh = 22;
  const py = 52;
  panneau(g, cx - bw / 2 - 10, py, bw + 20, bh * 2 + 24);
  bouton(g, boutons, 'EN LIGNE', cx - bw / 2, py + 8, bw, bh, etat.onLigne, { ...BLEU, e: 1 });
  bouton(g, boutons, 'RESEAU LOCAL', cx - bw / 2, py + 16 + bh, bw, bh, etat.onLocal, { ...VERT_BTN, e: 1 });
  bouton(g, boutons, '< RETOUR', cx - 45, H - 17, 90, 14, etat.onRetour, SOMBRE);
}

export interface EtatLigne {
  /** `pret` : on choisit ; `recherche` : on cherche le salon ; `connexion` : on y entre ou on le crée ; `erreur` : pas d'Internet */
  statut: 'recherche' | 'pret' | 'erreur' | 'connexion' | 'creation';
  message: string | null;
  pseudo: string;
  /** le code d'un lien d'invitation, s'il y en a un */
  invitation: string | null;
  onCree: () => void;
  onRejoint: () => void;
  onInvitation: () => void;
  onPseudo: () => void;
  onRetour: () => void;
}

/** Écran « EN LIGNE » : créer un salon (son code s'affiche dans la salle d'attente) ou rejoindre celui d'un ami. */
export function dessineLigne(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, temps: number, etat: EtatLigne): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'EN LIGNE', cx, 6, C.blanc, 2, 'c');
  dessinePseudo(g, boutons, cx, 28, etat.pseudo, etat.onPseudo);
  const pw = Math.min(W - 24, 280);
  const py = 52;
  panneau(g, cx - pw / 2, py, pw, 62);
  if (etat.statut === 'recherche' || etat.statut === 'connexion' || etat.statut === 'creation') {
    const texteEtat = etat.statut === 'recherche' ? 'RECHERCHE DU SALON' : etat.statut === 'creation' ? 'CREATION DU SALON' : 'CONNEXION';
    texte(g, texteEtat + points(temps), cx, py + 26, C.or, 1, 'c');
  } else if (etat.statut === 'erreur') {
    texte(g, etat.message ?? 'INTERNET INTROUVABLE', cx, py + 18, '#ff7a90', 1, 'c');
    texte(g, 'VERIFIEZ VOTRE CONNEXION', cx, py + 32, '#6f7aa6', 1, 'c');
    bouton(g, boutons, 'REESSAYER', cx - 45, py + 44, 90, 13, etat.onCree, BLEU);
  } else {
    bouton(g, boutons, 'CREER UN SALON', cx - pw / 2 + 8, py + 6, pw - 16, 16, etat.onCree, BLEU);
    if (etat.invitation) bouton(g, boutons, `REJOINDRE ${etat.invitation}`, cx - pw / 2 + 8, py + 28, pw - 16, 16, etat.onInvitation, VERT_BTN);
    else bouton(g, boutons, 'REJOINDRE AVEC UN CODE', cx - pw / 2 + 8, py + 28, pw - 16, 16, etat.onRejoint, VERT_BTN);
    texte(g, 'LE CODE SE DONNE DE VIVE VOIX OU PAR LIEN', cx, py + 49, '#6f7aa6', 1, 'c');
  }
  if (etat.message && etat.statut !== 'erreur') texte(g, etat.message, cx, py + 70, '#ff7a90', 1, 'c');
  if (etat.invitation && etat.statut === 'pret') bouton(g, boutons, 'AUTRE CODE', cx - 45, py + 78, 90, 12, etat.onRejoint, SOMBRE);
  bouton(g, boutons, '< RETOUR', cx - 45, H - 17, 90, 14, etat.onRetour, SOMBRE);
}
