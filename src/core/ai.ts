import { elan, esquive, ligneLibre, menaceEchec, meilleurReceveur, passeVers, tir } from './actions';
import { ECHEC_PREPA, ECHEC_PREPA_MAX, VMAX } from './constants';
import { demiCage } from './pouvoirs';
import { angleVersCoinLoin, butAttaque, butDefendu, sensAttaque } from './shooting';
import { equipe, plusProche } from './state-helpers';
import type { MatchState, Rink, Skater } from './types';
import { alea, angDiff, clamp, decalageRang, pointSegDist } from './utils';

/**
 * Occupation de la glace par les joueurs non contrôlés — réglages à ajuster
 * en jouant. Chaque patineur a un poste (voir `posteDe`) : le centre, les
 * ailiers qui tiennent leur couloir le long des bandes, et les défenseurs qui
 * restent en couverture derrière le jeu.
 */
export const DEMARQUAGE = {
  /** Deux coéquipiers plus proches que ça se gênent (px). */
  ecart: 44,
  /** Pénalité d'un point de soutien collé à un coéquipier (ou à sa destination). */
  penaliteEcart: 50,
  /** Couloir des ailiers, en part de la hauteur de la patinoire depuis l'axe. */
  couloirAilier: 0.3,
  /** Couloir des défenseurs quand ils sont deux (5 contre 5). */
  couloirDefenseur: 0.2,
  /** Jusqu'où un joueur s'écarte de son couloir pour se démarquer (part de la hauteur). */
  toleranceCouloir: 0.13,
  /** Recul des défenseurs derrière le porteur quand leur équipe attaque (px). */
  reculDefenseur: 75,
};

export type Poste = 'centre' | 'ailier' | 'defenseur';

/**
 * Poste d'un patineur selon son rang et l'effectif, et son couloir (décalage
 * vertical en part de la hauteur de la patinoire, du côté où il s'aligne à
 * l'engagement) :
 * - 2 joueurs : un centre, un défenseur ;
 * - 3 joueurs : un centre, un ailier, un défenseur ;
 * - 5 joueurs : un centre, deux ailiers, deux défenseurs.
 */
export function posteDe(s: Skater, nb: number): { poste: Poste; couloir: number } {
  const cote = Math.sign(decalageRang(s.rang, 1));
  // le renfort du bonus surnombre vient attaquer dans l'axe
  if (s.renfort) return { poste: 'ailier', couloir: 0 };
  if (s.rang === 0) return { poste: 'centre', couloir: 0 };
  if (nb <= 2) return { poste: 'defenseur', couloir: 0 };
  if (nb === 3) return s.rang === 1 ? { poste: 'ailier', couloir: cote * DEMARQUAGE.couloirAilier } : { poste: 'defenseur', couloir: cote * 0.08 };
  if (s.rang <= 2) return { poste: 'ailier', couloir: cote * DEMARQUAGE.couloirAilier };
  return { poste: 'defenseur', couloir: cote * DEMARQUAGE.couloirDefenseur };
}

/** Ligne bleue de la zone d'attaque de l'équipe `eq`. */
function bleueOffensive(rink: Rink, eq: number): number {
  return sensAttaque(eq as 0 | 1) > 0 ? rink.bleueD : rink.bleueG;
}

/**
 * Place d'un défenseur quand son équipe a le palet : derrière le porteur, sur
 * son couloir, sans dépasser la ligne bleue offensive (il tient la pointe) ni
 * rentrer dans sa propre cage.
 */
function placeDefenseur(rink: Rink, s: Skater, xPorteur: number, couloir: number): { x: number; y: number } {
  const dir = sensAttaque(s.eq);
  const def = butDefendu(rink, s.eq);
  let x = xPorteur - dir * DEMARQUAGE.reculDefenseur;
  // pas au-delà de la ligne bleue offensive, pas collé à sa cage
  const bleue = bleueOffensive(rink, s.eq) + dir * 6;
  if ((x - bleue) * dir > 0) x = bleue;
  if ((x - (def + dir * 30)) * dir < 0) x = def + dir * 30;
  return { x, y: rink.cy + couloir * rink.h };
}

/**
 * Se démarquer : parmi quelques points de soutien autour du porteur, choisir
 * celui qui offre une vraie option de passe — loin des adversaires, ligne de
 * passe dégagée, à bonne distance du porteur, sans se coller à un coéquipier.
 * `avant` : le soutien offensif (vers la cage) ou celui qui reste en retrait
 * pour la remise. `couloir` : le joueur cherche autour de son couloir (part de
 * la hauteur), au lieu de toute la largeur.
 */
export function pointDeSoutien(
  rink: Rink,
  state: MatchState,
  s: Skater,
  c: Skater,
  avant: boolean,
  couloir: number | null = null,
): { x: number; y: number } {
  const atk = butAttaque(rink, s.eq);
  const dir = sensAttaque(s.eq);
  const cy = rink.cy;
  const eux = equipe(state, s.eq === 0 ? 1 : 0);
  const autres = equipe(state, s.eq).filter((m) => m !== s && m !== c);
  const xs = avant ? [c.x + dir * 35, c.x + dir * 65, atk - dir * 45, atk - dir * 75] : [c.x - dir * 30, c.x - dir * 50, c.x];
  const tol = DEMARQUAGE.toleranceCouloir * rink.h;
  const ys = couloir === null ? [-48, -28, -10, 10, 28, 48] : [-1, -0.5, 0, 0.5, 1].map((k) => couloir * rink.h + k * tol);
  let meilleur = { x: s.x, y: s.y };
  let score = -Infinity;
  for (const x0 of xs) {
    for (const dy of ys) {
      const x = clamp(x0, rink.x + 14, rink.x + rink.w - 14);
      const y = clamp(cy + dy, rink.y + 14, rink.y + rink.h - 14);
      // pas derrière la cage adverse
      if ((x - atk) * dir > -18) continue;
      let sc = 0;
      const libre = Math.min(40, ...eux.map((e) => Math.hypot(e.x - x, e.y - y)));
      sc += libre * 1.2;
      sc += ligneLibre(state, s.eq, c.x, c.y, x, y) ? 30 : -30;
      const dc = Math.hypot(x - c.x, y - c.y);
      sc -= Math.abs(dc - 60) * 0.35;
      if (avant) sc += (x - c.x) * dir * 0.12;
      // l'écart avec les coéquipiers (et leurs destinations) : plus on est près, plus ça coûte
      for (const m of autres) {
        const d = Math.min(Math.hypot(m.x - x, m.y - y), Math.hypot(m.ia.tx - x, m.ia.ty - y));
        if (d < DEMARQUAGE.ecart) sc -= DEMARQUAGE.penaliteEcart * (1 - d / DEMARQUAGE.ecart);
      }
      if (couloir !== null) sc -= Math.abs(dy - couloir * rink.h) * 0.25;
      // un peu de constance : on ne traverse pas la patinoire pour un point à peine meilleur
      sc -= Math.hypot(x - s.x, y - s.y) * 0.08;
      if (sc > score) {
        score = sc;
        meilleur = { x, y };
      }
    }
  }
  return meilleur;
}

function planIA(rink: Rink, state: MatchState, s: Skater): void {
  const p = state.palet;
  const niv = state.nivEq[s.eq];
  const atk = butAttaque(rink, s.eq);
  const def = butDefendu(rink, s.eq);
  const dir = sensAttaque(s.eq);
  const cy = rink.cy;
  const ia = s.ia;
  const nous = equipe(state, s.eq);
  const eux = equipe(state, s.eq === 0 ? 1 : 0);
  const { poste, couloir } = posteDe(s, state.nb);
  const yCouloir = cy + couloir * rink.h;

  if (s.tient) {
    const o = plusProche(eux, s.x, s.y);
    const dx = atk - s.x;
    const dy = cy - s.y;
    const d = Math.hypot(dx, dy);
    const devant = (atk - s.x) * dir > 14;
    const angleOk = Math.abs(dy) < Math.abs(dx) * 1.7;
    const bouche = eux.some((e) => pointSegDist(e.x, e.y, s.x, s.y, atk, cy) < 9 && Math.hypot(e.x - s.x, e.y - s.y) < d);
    const presse = eux.some((e) => Math.hypot(e.x - s.x, e.y - s.y) < 22);
    const portee = niv.portee * s.st.puiss;
    const tirable = devant && angleOk && d < portee;
    // passer quand on est pressé ou qu'on n'a pas d'angle de tir
    if (!s.arme && nous.length > 1 && ((presse && Math.random() < 0.5) || (!tirable && Math.random() < 0.25) || (bouche && Math.random() < 0.35))) {
      const r = meilleurReceveur(state, s, s.eq, s.x, s.y, null);
      if (r && r.sc > 0) {
        passeVers(state, s, r.m, niv.err * 0.8);
        return;
      }
    }
    if (!s.arme && tirable && (!bouche || d < 55 || Math.random() < 0.2)) {
      s.arme = true;
      s.charge = 0;
      ia.but = clamp(0.2 + (d / portee) * 0.65 + alea(-0.1, 0.2), 0.15, 1);
    }
    if (!devant) {
      ia.tx = atk - dir * 55;
      ia.ty = s.y < cy ? cy - 42 : cy + 42;
    } else {
      ia.tx = atk - dir * 50;
      ia.ty = cy + (s.y < cy ? -18 : 18);
      const oDevant = o && (o.x - s.x) * dir > 0 && Math.hypot(o.x - s.x, o.y - s.y) < 40;
      if (oDevant && o) {
        ia.ty = clamp(s.y + (s.y > o.y ? 38 : -38), rink.y + 16, rink.y + rink.h - 16);
        ia.tx = s.x + dir * 40;
        if (s.elanCd <= 0 && Math.random() < 0.3) {
          s.ex = dir;
          s.ey = s.y > o.y ? 0.6 : -0.6;
          elan(state, s, s.ex, s.ey);
        }
      }
    }
  } else if (p.passe && p.passe.vers === s) {
    // aller au-devant de la passe
    const v2 = p.vx * p.vx + p.vy * p.vy || 1;
    const t = clamp(((s.x - p.x) * p.vx + (s.y - p.y) * p.vy) / v2, 0, 0.8);
    ia.tx = p.x + p.vx * t;
    ia.ty = p.y + p.vy * t;
    ia.t = Math.min(ia.t, 0.08);
  } else if (p.porteur && p.porteur.eq !== s.eq) {
    if (!('face' in p.porteur)) {
      // le gardien adverse tient le palet : on se replace chacun sur son couloir
      ia.tx = poste === 'defenseur' ? def + dir * rink.w * 0.25 : rink.cx - dir * 20;
      ia.ty = yCouloir;
    } else {
      const c = p.porteur;
      const actifs = nous.filter((m) => m.sonne <= 0);
      const presseur = plusProche(actifs.length ? actifs : nous, c.x, c.y);
      if (s === presseur) {
        const dDef = Math.abs(c.x - def);
        if (dDef < rink.w * 0.62 || Math.random() < 0.4) {
          ia.tx = c.x + c.vx * 0.22 + Math.cos(c.face) * 6;
          ia.ty = c.y + c.vy * 0.22 + Math.sin(c.face) * 6;
        } else {
          ia.tx = c.x + (def - c.x) * 0.3;
          ia.ty = c.y + (cy - c.y) * 0.3;
        }
        const dc = Math.hypot(c.x - s.x, c.y - s.y);
        // la mise en échec se prépare un instant (voir ECHEC_PREPA), puis part dans pilotageIA
        if (dc < 44 && s.elanCd <= 0 && s.prepaEchecT <= 0 && Math.random() < niv.check * s.st.phys * niv.reac * 1.2) {
          s.prepaEchecT = ECHEC_PREPA_MAX;
        }
      } else {
        // marquage individuel, côté but : les défenseurs prennent d'abord les
        // adversaires les plus dangereux (près de notre cage), les autres le plus proche
        let libres = eux.filter((e) => e !== c);
        let cible: Skater | null = null;
        const estDef = (m: Skater) => posteDe(m, state.nb).poste === 'defenseur';
        const marqueurs = nous.filter((m) => m !== presseur).sort((a, b) => Number(estDef(b)) - Number(estDef(a)) || a.rang - b.rang);
        for (const m of marqueurs) {
          let e: Skater | null = null;
          if (estDef(m)) {
            let meilleur = Infinity;
            for (const x of libres) {
              const v = Math.hypot(x.x - def, x.y - cy) * 0.6 + Math.hypot(x.x - m.x, x.y - m.y) * 0.4;
              if (v < meilleur) {
                meilleur = v;
                e = x;
              }
            }
          } else e = plusProche(libres, m.x, m.y);
          if (!e) break;
          libres = libres.filter((x) => x !== e);
          if (m === s) {
            cible = e;
            break;
          }
        }
        if (cible) {
          ia.tx = cible.x + (def - cible.x) * 0.2;
          ia.ty = cible.y + (cy - cible.y) * 0.2;
        } else {
          ia.tx = def + (c.x - def) * 0.35;
          ia.ty = cy + (c.y - cy) * 0.35;
        }
      }
    }
  } else if (p.porteur && p.porteur.eq === s.eq) {
    const c = p.porteur;
    if (!('face' in c)) {
      // relance depuis notre gardien : les défenseurs se proposent bas, les attaquants s'écartent sur leur couloir
      ia.tx = def + dir * rink.w * (poste === 'defenseur' ? 0.22 : 0.45);
      ia.ty = yCouloir;
    } else if (poste === 'defenseur') {
      // le défenseur reste en couverture, derrière le jeu : il offre la remise
      // en retrait (sur son couloir) sans jamais monter au-delà de la ligne bleue
      const base = placeDefenseur(rink, s, c.x, couloir);
      const pt = pointDeSoutien(rink, state, s, c, false, couloir);
      ia.tx = (pt.x - base.x) * dir < 0 ? pt.x : base.x;
      ia.ty = pt.y;
      ia.t = Math.min(ia.t, 0.2);
    } else {
      // attaquants : chacun se démarque vers la cage sur son couloir (le centre
      // dans l'axe, les ailiers le long des bandes), là où il y a de l'espace
      // et une ligne de passe dégagée
      const pt = pointDeSoutien(rink, state, s, c, true, couloir);
      ia.tx = pt.x;
      ia.ty = pt.y;
      // se replacer plus souvent tant qu'on n'est pas démarqué
      ia.t = Math.min(ia.t, 0.15);
    }
  } else {
    // palet libre : le plus proche fonce, les autres se placent
    const parDist = [...nous].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const k = parDist.indexOf(s);
    if (k === 0) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      const t = Math.min(0.6, d / 160);
      ia.tx = p.x + p.vx * t - dir * 4;
      ia.ty = p.y + p.vy * t;
    } else if (poste === 'defenseur') {
      // les défenseurs restent derrière le palet, sur leur couloir
      const pt = placeDefenseur(rink, s, p.x, couloir);
      ia.tx = pt.x;
      ia.ty = pt.y;
    } else if (k === 1) {
      ia.tx = p.x + (atk - p.x) * 0.3;
      ia.ty = couloir === 0 ? cy + (p.y < cy ? 26 : -26) : yCouloir;
    } else {
      // les autres attaquants se tiennent à hauteur du palet, sur leur couloir
      ia.tx = p.x + dir * 10;
      ia.ty = yCouloir;
    }
  }
  // stats : une bonne attaque monte plus haut quand l'équipe a le palet ; une bonne défense
  // se resserre sur le porteur adverse (les autres équipes sont plus lâches)
  if (!s.tient) {
    if (p.porteur && p.porteur.eq === s.eq) ia.tx += dir * (s.st.att - 1) * PLACEMENT_STATS;
    else if (p.porteur && p.porteur.eq !== s.eq) {
      ia.tx += (p.x - ia.tx) * (s.st.def - 1) * 1.5;
      ia.ty += (p.y - ia.ty) * (s.st.def - 1) * 1.5;
    }
  }
  ia.tx = clamp(ia.tx, rink.x + 8, rink.x + rink.w - 8);
  ia.ty = clamp(ia.ty, rink.y + 8, rink.y + rink.h - 8);
}

/** Pixels d'avance d'un patineur d'attaque pour un multiplicateur de +1 (donc ≈ 10 px pour la meilleure attaque). */
const PLACEMENT_STATS = 70;

export function pilotageIA(rink: Rink, state: MatchState, s: Skater, dt: number): void {
  const ia = s.ia;
  ia.t -= dt;
  if (ia.t <= 0) {
    ia.t = state.nivEq[s.eq].reac * alea(0.7, 1.3);
    planIA(rink, state, s);
  }
  // mise en échec en préparation : on charge dès que le porteur est assez près, mais
  // pas avant le délai minimal face à un humain (le temps de voir le « ! » et d'esquiver)
  if (s.prepaEchecT > 0) {
    s.prepaEchecT = Math.max(0, s.prepaEchecT - dt);
    const c = state.palet.porteur;
    if (s.sonne > 0 || !c || !('face' in c) || c.eq === s.eq) s.prepaEchecT = 0;
    else if (ECHEC_PREPA_MAX - s.prepaEchecT >= (c.humain ? ECHEC_PREPA : 0) && Math.hypot(c.x - s.x, c.y - s.y) < 28) {
      s.prepaEchecT = 0;
      elan(state, s, c.x + c.vx * 0.1 - s.x, c.y + c.vy * 0.1 - s.y);
    }
  }
  // porteur visé par une mise en échec : l'IA esquive parfois, selon son niveau
  // (probabilité répartie sur l'élan du défenseur, ~0,15 s ; la préparation ne compte pas)
  if (s.tient) {
    const menace = menaceEchec(state, s);
    const p = state.nivEq[s.eq].esquive;
    if (menace && menace.elanT > 0 && p > 0 && Math.random() < (-Math.log(1 - p) / 0.15) * dt) esquive(state, s, menace);
  }
  // si on perd le palet en armant, on oublie le tir
  if (s.arme && !s.tient) {
    s.arme = false;
    s.charge = 0;
  }
  if (s.arme) {
    s.charge = Math.min(1, s.charge + (dt / 0.85) * s.st.frappe);
    if (s.charge >= ia.but) {
      const gardien = state.gardiens[s.eq === 0 ? 1 : 0];
      tir(state, rink, s, angleVersCoinLoin(rink, s.eq, s.x, s.y, gardien, clamp(state.nivEq[s.eq].err * (2 - (s.st.frappe + s.st.puiss) / 2), 0.01, 1), demiCage(state, s.eq === 0 ? 1 : 0)), s.charge);
    }
  }
  // pilotage : vitesse désirée moins vitesse actuelle
  const dx = ia.tx - s.x;
  const dy = ia.ty - s.y;
  const d = Math.hypot(dx, dy);
  const vmax = VMAX * s.vit;
  const vd = Math.min(1, d / 26) * vmax;
  const dvx = (d > 0 ? (dx / d) * vd : 0) - s.vx;
  const dvy = (d > 0 ? (dy / d) * vd : 0) - s.vy;
  const m = Math.hypot(dvx, dvy);
  const k = Math.min(1, m / (vmax * 0.35));
  s.ex = m > 0 ? (dvx / m) * k : 0;
  s.ey = m > 0 ? (dvy / m) * k : 0;
  if (d < 3 && Math.hypot(s.vx, s.vy) < 15) {
    s.ex = s.ey = 0;
  }
  // tourner la crosse vers le but quand on porte le palet
  if (s.tient && s.arme) {
    const a = Math.atan2(rink.cy - s.y, butAttaque(rink, s.eq) - s.x);
    s.face += clamp(angDiff(s.face, a), -8 * dt, 8 * dt);
  }
}
