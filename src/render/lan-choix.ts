/** Choix des équipes puis des maillots, en Wi-Fi. */

import { texte } from './pixel-font';
import { px } from './primitives';
import type { BanqueSprites } from './sprites';
import { dessinePanneauEquipe, dessinePanneauMaillot, type CarteEquipe } from './team-select';
import { type Variante } from './team-visuals';
import { C } from './theme';
import { bouton, type ZoneBouton } from './widgets';
import { points, ROUGE, VERT } from './lan-commun';

// ============================================= équipes puis maillots, à deux ==

export interface CoteChoixLan {
  nom: string;
  pret: boolean;
  carte: CarteEquipe;
  variante: Variante;
}

export interface EtatChoixLan {
  etape: 'equipes' | 'maillots';
  /** Mon camp : 0 = gauche (celui de l'hôte), 1 = droite. */
  moi: 0 | 1;
  /** `pret` : tous les joueurs du camp sont prêts (l'hôte seul décide quand `hoteChoisit`). */
  cotes: [CoteChoixLan, CoteChoixLan];
  /** Coop : l'hôte et son équipier jouent ensemble contre le CPU (libellés des deux côtés). */
  coop: boolean;
  /** L'hôte règle les deux camps et valide seul (tous les formats sauf 1 contre 1) ; les autres regardent. */
  hoteChoisit: boolean;
  hote: boolean;
  nomHote: string;
  /** Mon maillot est identique à celui de l'adversaire déjà prêt : impossible de valider. */
  maillotPris: boolean;
  /** `cote` : le panneau touché (en coop, l'hôte règle les deux). */
  onPrecedent: (cote: 0 | 1) => void;
  onSuivant: (cote: 0 | 1) => void;
  onToggleMaillot: (cote: 0 | 1) => void;
  onPret: (pret: boolean) => void;
  onQuitter: () => void;
}

/**
 * Sélection simultanée : chacun ne règle que son côté ; « PRET » verrouille
 * son choix (MODIFIER pour revenir dessus) et l'étape suivante n'arrive
 * qu'une fois les deux joueurs prêts.
 */
export function dessineChoixLan(
  g: CanvasRenderingContext2D,
  boutons: ZoneBouton[],
  sprites: BanqueSprites,
  W: number,
  H: number,
  temps: number,
  etat: EtatChoixLan,
): void {
  g.fillStyle = 'rgba(7,9,20,0.84)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const moitie = Math.floor(W / 2);
  const bas = H - 22;
  const titre = etat.etape === 'equipes' ? 'CHOIX DES EQUIPES' : 'CHOIX DES MAILLOTS';
  texte(g, etat.coop ? `COOP : ${titre}` : titre, cx, 2, etat.coop ? VERT : C.blanc, 1, 'c');
  px(g, moitie - 1, 12, 1, bas - 16, '#2a3160');

  const autre = etat.cotes[etat.moi === 0 ? 1 : 0];
  // seul l'hôte règle (les deux camps) et valide ; les autres regardent
  const suiveur = etat.hoteChoisit && !etat.hote;
  for (const place of [0, 1] as const) {
    const c = etat.cotes[place];
    const x = place === 0 ? 0 : moitie;
    const w = place === 0 ? moitie : W - moitie;
    const moiAgit = etat.hoteChoisit ? etat.hote : place === etat.moi;
    const actif = moiAgit && !c.pret;
    // coop : à gauche l'équipe des deux joueurs, à droite le CPU
    const nom = etat.coop ? (place === 0 ? 'NOTRE EQUIPE' : 'ADVERSAIRE CPU') : c.nom;
    if (etat.etape === 'equipes') {
      dessinePanneauEquipe(g, boutons, x, w, H, nom, c.carte, actif ? () => etat.onPrecedent(place) : null, actif ? () => etat.onSuivant(place) : null, {
        echelleLogo: 0.42,
        hauteurNotes: 0.63,
      });
    } else {
      dessinePanneauMaillot(g, boutons, sprites, x, w, H, nom, { def: c.carte.def, variante: c.variante }, place === 0, actif ? () => etat.onToggleMaillot(place) : null);
    }
    const sx = x + w / 2;
    const sy = bas - 12;
    if (c.pret) {
      texte(g, 'PRET !', sx, sy, VERT, 1, 'c');
    } else if (moiAgit && etat.maillotPris) {
      texte(g, 'MAILLOT DEJA PRIS', sx, sy, '#ff9a5c', 1, 'c');
    } else {
      g.globalAlpha = moiAgit ? 1 : 0.5 + 0.5 * Math.abs(Math.sin(temps * 2.5));
      const qui = suiveur ? `${etat.nomHote} ` : '';
      texte(g, moiAgit ? 'A VOUS DE CHOISIR' : `${qui}CHOISIT${points(temps)}`, sx, sy, C.gris, 1, 'c');
      g.globalAlpha = 1;
    }
  }

  const moi = etat.cotes[etat.moi];
  bouton(g, boutons, '< QUITTER', 4, bas, 66, 16, etat.onQuitter, { couleur: '#232a58' });
  if (suiveur) {
    // les autres n'ont rien à valider : ils suivent les choix de l'hôte
    g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(temps * 2.5));
    texte(g, `${etat.nomHote} CHOISIT LES EQUIPES${points(temps)}`, cx, bas + 5, C.or, 1, 'c');
    g.globalAlpha = 1;
  } else if (!moi.pret) {
    if (etat.maillotPris) texte(g, 'CHANGEZ DE MAILLOT', cx, bas + 5, '#ff9a5c', 1, 'c');
    else bouton(g, boutons, 'PRET', cx - 45, bas, 90, 16, () => etat.onPret(true), { e: 2, ...ROUGE });
  } else {
    bouton(g, boutons, 'MODIFIER', cx - 40, bas, 80, 16, () => etat.onPret(false), { couleur: '#232a58' });
    if (!etat.hoteChoisit && !autre.pret) texte(g, `EN ATTENTE DE ${autre.nom}`, W - 6, bas + 5, C.or, 1, 'd');
  }
}
