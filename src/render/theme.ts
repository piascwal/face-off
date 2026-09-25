export interface Equipe {
  nom: string;
  maillot: string;
  fonce: string;
  clair: string;
  casque: string;
}

export const EQUIPES: [Equipe, Equipe] = [
  { nom: 'VOUS', maillot: '#2ec8f5', fonce: '#155f9e', clair: '#b6f0ff', casque: '#155f9e' },
  { nom: 'CPU', maillot: '#f5415e', fonce: '#8c1b3a', clair: '#ffc2cc', casque: '#8c1b3a' },
];

export const C = {
  nuit: '#070914',
  contour: '#0b0e1d',
  rouge: '#d8344d',
  bleu: '#2f6fdb',
  zone: '#8cc8f2',
  planche: '#f3f5fb',
  plancheOmbre: '#c9cfe0',
  plinthe: '#e7b53c',
  blanc: '#ffffff',
  or: '#ffd35c',
  gris: '#8a93b0',
};
