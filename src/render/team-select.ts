import type { TeamProfile } from '@core/teams';
import { texte } from './pixel-font';
import { px } from './primitives';
import { C } from './theme';
import type { EquipeVisuelle } from './team-visuals';
import { bouton, panneau, type ZoneBouton } from './widgets';

export interface CarteEquipe {
  visuel: EquipeVisuelle;
  profil: TeamProfile;
}

export interface EtatSelectionEquipe {
  etape: 'joueur' | 'adversaire';
  cartes: CarteEquipe[];
  equipeJoueur: EquipeVisuelle | null;
  onChoisir: (id: string) => void;
  onRetour: () => void;
}

const logos = new Map<string, HTMLImageElement>();
function logo(id: string): HTMLImageElement | null {
  if (!id) return null;
  const existant = logos.get(id);
  if (existant) return existant.complete ? existant : null;
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}logos/${id}.png`;
  logos.set(id, img);
  return null;
}

const STATS: (keyof TeamProfile)[] = ['vit', 'tir', 'defense', 'gardien'];

function barreStat(g: CanvasRenderingContext2D, x: number, y: number, w: number, valeur: number, col: string): void {
  // valeur : multiplicateur ~0.85..1.15 → jauge 0..1
  const t = Math.max(0, Math.min(1, (valeur - 0.85) / 0.3));
  px(g, x, y, w, 2, '#1c2140');
  px(g, x, y, Math.max(1, Math.round(w * t)), 2, col);
}

export function dessineSelectionEquipe(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, etat: EtatSelectionEquipe): void {
  g.fillStyle = 'rgba(7,9,20,0.72)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const titre = etat.etape === 'joueur' ? 'CHOISISSEZ VOTRE EQUIPE' : "CHOISISSEZ L'ADVERSAIRE";
  texte(g, titre, cx, 6, C.blanc, 1, 'c');
  if (etat.etape === 'adversaire' && etat.equipeJoueur) {
    texte(g, `VOUS : ${etat.equipeJoueur.code}`, cx, 15, etat.equipeJoueur.clair, 1, 'c');
  }

  const cols = 3;
  const rows = 2;
  const margeX = 6;
  const hautDebut = etat.etape === 'adversaire' ? 22 : 16;
  const marge = 4;
  const cw = Math.floor((W - margeX * 2 - marge * (cols - 1)) / cols);
  const ch = Math.floor((H - hautDebut - 6 - marge * (rows - 1)) / rows);

  etat.cartes.forEach((carte, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margeX + col * (cw + marge);
    const y = hautDebut + row * (ch + marge);
    const estMoi = etat.etape === 'adversaire' && etat.equipeJoueur?.id === carte.visuel.id;

    panneau(g, x, y, cw, ch);
    px(g, x, y, cw, 2, carte.visuel.maillot);

    const img = logo(carte.visuel.id);
    const tailleLogo = Math.min(cw * 0.34, ch * 0.5);
    if (img) {
      g.imageSmoothingEnabled = true;
      g.drawImage(img, x + 3, y + 4, tailleLogo, tailleLogo);
      g.imageSmoothingEnabled = false;
    }

    const tx = x + tailleLogo + 6;
    texte(g, carte.visuel.code, tx, y + 4, carte.visuel.clair, 1, 'g');

    const statsY = y + tailleLogo + 7;
    const barW = cw - 6;
    STATS.forEach((cle, k) => {
      barreStat(g, x + 3, statsY + k * 4, barW, carte.profil[cle] as number, carte.visuel.maillot);
    });

    if (estMoi) {
      texte(g, 'VOUS', x + cw / 2, y + ch - 8, carte.visuel.clair, 1, 'c');
    } else {
      const act = () => etat.onChoisir(carte.visuel.id);
      boutons.push({ x, y, w: cw, h: ch, act });
    }
  });

  if (etat.etape === 'adversaire') {
    bouton(g, boutons, '< RETOUR', 4, H - 11, 46, 9, etat.onRetour, { couleur: '#232a58', e: 1 });
  }
}
