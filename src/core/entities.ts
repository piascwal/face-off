import type { Goalie, Puck, Skater, TeamId } from './types';

export function nouveauPatineur(eq: TeamId, rang: number): Skater {
  return {
    eq,
    rang,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: eq === 0 ? 0 : Math.PI,
    r: 5,
    tient: false,
    recupCd: 0,
    elanT: 0,
    elanCd: 0,
    sonne: 0,
    charge: 0,
    arme: false,
    pokeT: 0,
    frappe: 0,
    frappeAmp: 0,
    anim: 0,
    humain: false,
    ex: 0,
    ey: 0,
    vit: 1,
    grince: 0,
    vise: null,
    ia: { t: 0, tx: 0, ty: 0, but: 0.5 },
  };
}

export function nouveauGardien(eq: TeamId): Goalie {
  return { eq, a: 0, x: 0, y: 0, r: 4, tient: 0, cd: 0, vit: 3, antic: 0.4, secoue: 0 };
}

export function nouveauPalet(): Puck {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 2.2,
    porteur: null,
    dernier: null,
    tireur: null,
    passe: null,
    trace: [],
    qualite: 0,
  };
}
