/**
 * Les notes des deux équipes depuis le menu pause : les deux radars côte à côte
 * (chaque moitié d'écran a le sien, les flèches passent du patineur normal au
 * joueur star), avec le résumé GAR / DEF / ATT / GLB.
 */
import { trouveEquipe } from '@core/teams';
import { dessinePanneauEquipe, type CarteEquipe } from './team-select';
import { texte } from './pixel-font';
import { basculeStats, fermeStats, modeStats } from './stats-ecran';
import { EQUIPES_JOUABLES, type EquipeVisuelle } from './team-visuals';
import { C } from './theme';
import { bouton, type ZoneBouton } from './widgets';

/** Ouvre les deux radars (ou ne fait rien s'ils le sont déjà). */
export function ouvreStatsPause(): void {
  for (const cote of [0, 1] as const) if (!modeStats(cote)) basculeStats(cote);
}

/** Les deux équipes du match en cartes (écusson + notes) ; null si l'une n'est pas une équipe connue. */
export function cartesDuMatch(equipes: readonly [EquipeVisuelle, EquipeVisuelle]): [CarteEquipe, CarteEquipe] | null {
  const cartes = equipes.map((e) => {
    const def = EQUIPES_JOUABLES.find((d) => d.id === e.teamId);
    return def ? { def, profil: trouveEquipe(def.id) } : null;
  });
  return cartes[0] && cartes[1] ? [cartes[0], cartes[1]] : null;
}

export function dessineStatsPause(g: CanvasRenderingContext2D, boutons: ZoneBouton[], W: number, H: number, cartes: [CarteEquipe, CarteEquipe]): void {
  g.fillStyle = 'rgba(7,9,20,0.96)';
  g.fillRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  texte(g, 'STATS DES EQUIPES', cx, 2, C.blanc, 1, 'c');
  const moitie = Math.floor(W / 2);
  g.fillStyle = '#2a3160';
  g.fillRect(moitie - 1, 12, 1, H - 38);
  const opts = { sansBoutonStats: true };
  dessinePanneauEquipe(g, boutons, 0, moitie, H, '', cartes[0], null, null, opts);
  dessinePanneauEquipe(g, boutons, moitie, W - moitie, H, '', cartes[1], null, null, opts);
  bouton(g, boutons, '< RETOUR', cx - 35, H - 22, 70, 16, fermeStats, { couleur: '#232a58', e: 1 });
}
