export interface Palette {
  maillot: string;
  fonce: string;
  clair: string;
  casque: string;
}

export type Variante = 'interieur' | 'exterieur';

export interface TeamDef {
  id: string;
  nom: string;
  ville: string;
  /** Nom court utilisé sur le tableau de score (7 caractères max). */
  code: string;
  logo: string;
  interieur: Palette;
  exterieur: Palette;
}

/** Palette « extérieur » : on inverse corps/bande du maillot domicile (casque et
 * gants restent aux couleurs de l'équipe) — assez différent pour éviter un choc
 * de couleurs avec l'adversaire, sans avoir à redessiner un jeu de teintes. */
function inverse({ maillot, fonce, clair, casque }: Palette): Palette {
  return { maillot: clair, fonce, clair: maillot, casque };
}

const INTERIEURS: Omit<TeamDef, 'exterieur'>[] = [
  {
    id: 'toulouse',
    nom: 'TBHC',
    ville: 'Toulouse',
    code: 'TOULOUSE',
    logo: 'logos/toulouse.png',
    interieur: { maillot: '#d81f26', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
  },
  {
    id: 'nice',
    nom: 'Les Aigles',
    ville: 'Nice',
    code: 'NICE',
    logo: 'logos/nice.png',
    interieur: { maillot: '#17181a', fonce: '#7a1017', clair: '#e8b73a', casque: '#17181a' },
  },
  {
    id: 'vaujany',
    nom: 'Grizzlys',
    ville: 'Vaujany',
    code: 'VAUJANY',
    logo: 'logos/vaujany.png',
    interieur: { maillot: '#9c2b1f', fonce: '#5c3a1e', clair: '#dba24a', casque: '#5c3a1e' },
  },
  {
    id: 'nimes',
    nom: 'Krokos',
    ville: 'Nîmes',
    code: 'NIMES',
    logo: 'logos/nimes.png',
    interieur: { maillot: '#2f7d3a', fonce: '#163a1b', clair: '#d8b23a', casque: '#163a1b' },
  },
  {
    id: 'grenoble',
    nom: 'Brûleurs de Loups',
    ville: 'Grenoble',
    code: 'GRENOBLE',
    logo: 'logos/grenoble.png',
    interieur: { maillot: '#2f6fd0', fonce: '#0c1830', clair: '#f2661c', casque: '#0c1830' },
  },
  {
    id: 'montpellier',
    nom: 'Vipers',
    ville: 'Montpellier',
    code: 'MTP',
    logo: 'logos/montpellier.png',
    interieur: { maillot: '#0d1e4a', fonce: '#071230', clair: '#e8611c', casque: '#0d1e4a' },
  },
  {
    id: 'montreal',
    nom: 'Canadiens',
    ville: 'Montréal',
    code: 'MONTREAL',
    logo: 'logos/montreal.png',
    interieur: { maillot: '#af1e2d', fonce: '#14205c', clair: '#ffffff', casque: '#14205c' },
  },
  {
    id: 'ducks',
    nom: 'Ducks',
    ville: 'Anaheim',
    code: 'ANAHEIM',
    logo: 'logos/ducks.png',
    interieur: { maillot: '#0d0d0d', fonce: '#c9a227', clair: '#f2661c', casque: '#0d0d0d' },
  },
  {
    id: 'marseille',
    nom: 'Spartiates',
    ville: 'Marseille',
    code: 'MARSEILLE',
    logo: 'logos/marseille.png',
    interieur: { maillot: '#2f7bbf', fonce: '#16213e', clair: '#c7ccd1', casque: '#2b2f38' },
  },
  {
    id: 'valence',
    nom: 'Lynx',
    ville: 'Valence',
    code: 'VALENCE',
    logo: 'logos/valence.png',
    interieur: { maillot: '#c41e3a', fonce: '#0d0d0d', clair: '#ffffff', casque: '#0d0d0d' },
  },
  {
    id: 'annecy',
    nom: 'Chevaliers',
    ville: 'Annecy',
    code: 'ANNECY',
    logo: 'logos/annecy.png',
    interieur: { maillot: '#141414', fonce: '#8b1e1e', clair: '#ffffff', casque: '#141414' },
  },
  {
    id: 'colorado',
    nom: 'Avalanche',
    ville: 'Colorado',
    code: 'COLORADO',
    logo: 'logos/colorado.png',
    interieur: { maillot: '#6f263d', fonce: '#236192', clair: '#ffffff', casque: '#6f263d' },
  },
  {
    id: 'roanne',
    nom: 'Renards',
    ville: 'Roanne',
    code: 'ROANNE',
    logo: 'logos/roanne.png',
    interieur: { maillot: '#141414', fonce: '#f2c200', clair: '#ffffff', casque: '#141414' },
  },
  {
    id: 'ottawa',
    nom: 'Senators',
    ville: 'Ottawa',
    code: 'OTTAWA',
    logo: 'logos/ottawa.png',
    interieur: { maillot: '#c8102e', fonce: '#141414', clair: '#ffffff', casque: '#141414' },
  },
];

export const EQUIPES_JOUABLES: TeamDef[] = INTERIEURS.map((def) => ({
  ...def,
  exterieur: inverse(def.interieur),
}));

export function trouveTeamDef(id: string): TeamDef {
  return EQUIPES_JOUABLES.find((e) => e.id === id) ?? EQUIPES_JOUABLES[0]!;
}

export function palette(def: TeamDef, variante: Variante): Palette {
  return variante === 'exterieur' ? def.exterieur : def.interieur;
}

/**
 * Forme « à plat » consommée par tout le reste du rendu (scène, HUD, effets,
 * sprites) : une équipe + son maillot déjà résolus pour le match en cours.
 * `id` sert de clé de sprite (`skater-<id>.png`), composée avec la variante ;
 * `teamId` reste l'identifiant pur pour les stats et le logo.
 */
export interface EquipeVisuelle extends Palette {
  id: string;
  teamId: string;
  nom: string;
  ville: string;
  code: string;
  logo: string;
}

/** Luminosité perçue d'une couleur « #rrggbb » (0..255). */
export function luminosite(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/** Éclaircit une couleur (mélange avec du blanc) jusqu'à ce qu'elle se lise sur un fond sombre. */
export function lisible(hex: string, minimum = 150): string {
  let n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  for (let i = 0; i < 12 && 0.299 * r + 0.587 * g + 0.114 * b < minimum; i++) {
    r += (255 - r) * 0.18;
    g += (255 - g) * 0.18;
    b += (255 - b) * 0.18;
  }
  n = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * La couleur d'une équipe pour écrire son nom sur un fond sombre : la plus
 * claire de son maillot (le noir de Nice disparaîtrait), éclaircie au besoin.
 */
export function couleurNom(pal: Palette): string {
  return lisible(luminosite(pal.clair) >= luminosite(pal.maillot) ? pal.clair : pal.maillot);
}

export function resoutEquipe(def: TeamDef, variante: Variante): EquipeVisuelle {
  return {
    id: `${def.id}-${variante}`,
    teamId: def.id,
    nom: def.nom,
    ville: def.ville,
    code: def.code,
    logo: def.logo,
    ...palette(def, variante),
  };
}
