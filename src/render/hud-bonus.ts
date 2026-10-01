import { DEF_POUVOIRS, POUVOIRS, TIRAGE_S } from '@core/pouvoirs';
import type { EtatPouvoirs, MatchState, PouvoirId, TeamId } from '@core/types';
import { zoneBonus } from './hud-zones';
import { dessineIconeBonus } from './icones-bonus';
import { largeurTexte, texte } from './pixel-font';
import { anneau, disque, px } from './primitives';
import { C } from './theme';

const BLEU = '#3a4590';
const VIDE = '#2a3160';

/**
 * Case du bonus (20×20) : « ? » tant que rien n'est tiré, les icônes qui
 * défilent pendant le tirage, puis l'icône du bonus obtenu.
 */
function caseBonus(g: CanvasRenderingContext2D, x: number, y: number, pv: EtatPouvoirs, temps: number): void {
  const id = pv.actif ?? pv.pret;
  const pret = pv.pret !== null && pv.tirage <= 0;
  px(g, x - 1, y - 1, 22, 22, pret ? (Math.floor(temps * 4) % 2 ? C.blanc : C.or) : id ? C.or : BLEU);
  px(g, x, y, 20, 20, '#141939');
  if (pv.tirage > 0 && pv.pret) {
    // tirage : la roue d'icônes ralentit puis s'arrête sur le bonus tiré
    // la roue ne montre que les bonus qui peuvent sortir
    const roue = POUVOIRS.filter((id) => DEF_POUVOIRS[id].dispo || id === pv.pret);
    const n = roue.length;
    const cible = 2 * n + roue.indexOf(pv.pret);
    const u = 1 - pv.tirage / TIRAGE_S;
    const pos = cible * (1 - Math.pow(1 - u, 3));
    g.save();
    g.beginPath();
    g.rect(x, y, 20, 20);
    g.clip();
    for (let d = -1; d <= 1; d++) {
      const i = Math.floor(pos) + d;
      dessineIconeBonus(g, roue[((i % n) + n) % n]!, x + 10, y + 10 + (i - pos) * 20, 14);
    }
    g.restore();
    return;
  }
  dessineIconeBonus(g, id ?? 'inconnu', x + 10, y + 10, 14);
}

/** Temps restant d'un bonus en cours (0..1), ou null s'il dure jusqu'au prochain but. */
function resteRelatif(pv: EtatPouvoirs): number | null {
  if (!pv.actif || !Number.isFinite(pv.reste)) return null;
  return Math.max(0, Math.min(1, pv.reste / DEF_POUVOIRS[pv.actif].duree));
}

/**
 * Jauge des bonus d'une équipe. Version complète (en haut à gauche, pour le
 * joueur) : la case, puis les pastilles des passes, le nom du bonus prêt ou
 * son temps restant. Version compacte (en haut à droite, pour l'adversaire) :
 * la case, et dessous les passes ou le temps restant.
 */
export function dessineJaugeBonus(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  pv: EtatPouvoirs,
  temps: number,
  compacte: boolean,
  clavier: boolean,
): void {
  const id: PouvoirId | null = pv.actif ?? (pv.tirage <= 0 ? pv.pret : null);
  const nom = id ? DEF_POUVOIRS[id].nom : '';
  if (compacte) {
    // x : bord droit
    const x0 = x - 20;
    caseBonus(g, x0, y, pv, temps);
    const r = resteRelatif(pv);
    if (pv.actif) {
      px(g, x0, y + 23, 20, 2, VIDE);
      px(g, x0, y + 23, Math.round(20 * (r ?? 1)), 2, C.or);
    } else if (!pv.pret) texte(g, `${pv.passes}/${pv.seuil}`, x0 + 10, y + 23, C.gris, 1, 'c');
    return;
  }
  const larg = 26 + Math.max(id ? largeurTexte(nom) : 0, pv.seuil * 7);
  g.fillStyle = 'rgba(7,9,20,0.6)';
  g.fillRect(x - 3, y - 3, larg + 3, 26);
  caseBonus(g, x, y, pv, temps);
  const tx = x + 25;
  if (pv.actif) {
    texte(g, nom, tx, y + 2, C.or, 1, 'g');
    const r = resteRelatif(pv);
    const w = larg - 27;
    if (r === null) texte(g, 'PROCHAIN BUT', tx, y + 12, C.blanc, 1, 'g');
    else {
      px(g, tx, y + 13, w, 3, VIDE);
      px(g, tx, y + 13, Math.round(w * r), 3, pv.reste < 2 && Math.floor(temps * 8) % 2 ? C.blanc : C.or);
    }
    return;
  }
  if (id) {
    const cl = Math.floor(temps * 4) % 2 ? C.blanc : C.or;
    texte(g, nom, tx, y + 2, C.or, 1, 'g');
    texte(g, clavier ? 'PRET ! TOUCHE B' : 'PRET !', tx, y + 12, cl, 1, 'g');
    return;
  }
  // jauge des passes (pastilles pleines pour les passes faites), ou tirage en cours
  for (let i = 0; i < pv.seuil; i++) {
    const plein = pv.pret !== null || i < pv.passes;
    px(g, tx + i * 7, y + 7, 5, 5, plein ? C.or : VIDE);
  }
  texte(g, pv.pret ? 'TIRAGE...' : 'PASSES', tx, y + 15, pv.pret ? C.or : '#6f7aa6', 1, 'g');
}

/**
 * Les jauges du match : celle de l'équipe de cet écran en haut à gauche,
 * celle de l'adversaire (compacte) en haut à droite, sous le bouton pause.
 * Spectateur (`eqLocal` null) : l'équipe 0 à gauche, l'équipe 1 à droite.
 */
export function dessineJaugesBonus(g: CanvasRenderingContext2D, W: number, state: MatchState, eqLocal: TeamId | null, temps: number, clavier: boolean): void {
  const pv = state.pouvoirs;
  if (!pv) return;
  const moi: TeamId = eqLocal ?? 0;
  const eux: TeamId = moi === 0 ? 1 : 0;
  dessineJaugeBonus(g, 6, 5, pv[moi], temps, false, clavier && eqLocal !== null);
  dessineJaugeBonus(g, W - 6, 24, pv[eux], temps, true, false);
}

/** Bouton BONUS (tactile), au-dessus de PASSE : pastille dorée avec l'icône, anneau qui pulse. */
export function dessineBoutonBonus(g: CanvasRenderingContext2D, W: number, H: number, temps: number, id: PouvoirId, appui: boolean): void {
  const z = zoneBonus(W, H);
  const p = 0.5 + 0.5 * Math.sin(temps * 6);
  g.globalAlpha = 0.5 + 0.4 * p;
  anneau(g, z.x, z.y, z.r + 3 + p * 2, C.or, 1, 2);
  g.globalAlpha = 0.95;
  disque(g, z.x, z.y, z.r, C.contour);
  disque(g, z.x, z.y + (appui ? 1 : 0), z.r - 1, '#e8a820');
  if (!appui) disque(g, z.x, z.y + 1, z.r - 3, '#ffc93c');
  g.globalAlpha = 1;
  disque(g, z.x, z.y, 9, '#20243a');
  dessineIconeBonus(g, id, z.x, z.y, 14);
  texte(g, 'BONUS', z.x, z.y - z.r - 10, C.or, 1, 'c');
}
