export interface EquipeVisuelle {
  id: string;
  nom: string;
  ville: string;
  /** Nom court utilisé sur le tableau de score (7 caractères max). */
  code: string;
  maillot: string;
  fonce: string;
  clair: string;
  casque: string;
  logo: string;
}

/**
 * Couleurs de maillot choisies à partir des écussons fournis (assets/logos-src) :
 * on reprend la teinte dominante de chaque logo pour le maillot, une teinte
 * plus sombre pour les épaulettes/casque, une teinte claire pour la bande et
 * le numéro. Le POC n'avait que deux équipes fixes (bleu « vous », rouge
 * « CPU ») ; le mode démo (menu) continue à utiliser ces couleurs neutres.
 */
export const EQUIPES_VISUELLES: EquipeVisuelle[] = [
  {
    id: 'toulouse',
    nom: 'TBHC',
    ville: 'Toulouse',
    code: 'TOULOUSE',
    maillot: '#d81f26',
    fonce: '#141414',
    clair: '#ffffff',
    casque: '#141414',
    logo: 'logos/toulouse.png',
  },
  {
    id: 'nice',
    nom: 'Les Aigles',
    ville: 'Nice',
    code: 'NICE',
    maillot: '#17181a',
    fonce: '#7a1017',
    clair: '#e8b73a',
    casque: '#17181a',
    logo: 'logos/nice.png',
  },
  {
    id: 'vaujany',
    nom: 'Grizzlys',
    ville: 'Vaujany',
    code: 'VAUJANY',
    maillot: '#9c2b1f',
    fonce: '#5c3a1e',
    clair: '#dba24a',
    casque: '#5c3a1e',
    logo: 'logos/vaujany.png',
  },
  {
    id: 'nimes',
    nom: 'Krokos',
    ville: 'Nîmes',
    code: 'NIMES',
    maillot: '#2f7d3a',
    fonce: '#163a1b',
    clair: '#d8b23a',
    casque: '#163a1b',
    logo: 'logos/nimes.png',
  },
  {
    id: 'grenoble',
    nom: 'Brûleurs de Loups',
    ville: 'Grenoble',
    code: 'GRENOBLE',
    maillot: '#2f6fd0',
    fonce: '#0c1830',
    clair: '#f2661c',
    casque: '#0c1830',
    logo: 'logos/grenoble.png',
  },
  {
    id: 'montpellier',
    nom: 'Vipers',
    ville: 'Montpellier',
    code: 'MTP',
    maillot: '#0d1e4a',
    fonce: '#071230',
    clair: '#e8611c',
    casque: '#0d1e4a',
    logo: 'logos/montpellier.png',
  },
];

/** Couleurs neutres utilisées en démo (menu d'accueil), avant tout choix d'équipe. */
export const EQUIPES_DEMO: [EquipeVisuelle, EquipeVisuelle] = [
  {
    id: 'demo-bleu',
    nom: 'Bleus',
    ville: '',
    code: 'BLEUS',
    maillot: '#2ec8f5',
    fonce: '#155f9e',
    clair: '#b6f0ff',
    casque: '#155f9e',
    logo: '',
  },
  {
    id: 'demo-rouge',
    nom: 'Rouges',
    ville: '',
    code: 'ROUGES',
    maillot: '#f5415e',
    fonce: '#8c1b3a',
    clair: '#ffc2cc',
    casque: '#8c1b3a',
    logo: '',
  },
];

export function trouveEquipeVisuelle(id: string): EquipeVisuelle {
  return EQUIPES_VISUELLES.find((e) => e.id === id) ?? EQUIPES_VISUELLES[0]!;
}
