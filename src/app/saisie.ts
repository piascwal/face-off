/**
 * Saisie de texte (pseudo, code de salon) : le jeu est dessiné sur un canvas, donc
 * on pose un petit champ HTML par-dessus le temps de la saisie. C'est lui qui fait
 * apparaître le clavier d'un téléphone.
 */
export interface OptionsSaisie {
  titre: string;
  valeur: string;
  max: number;
  /** nettoie le texte à chaque frappe (majuscules, caractères permis...) */
  filtre: (texte: string) => string;
  /** valide le texte final : le texte propre, ou null (la saisie reste ouverte avec `erreur`) */
  valide: (texte: string) => string | null;
  erreur: string;
  surValide: (texte: string) => void;
}

let ouverte: HTMLElement | null = null;

/** Une saisie est ouverte : le jeu ne doit pas prendre les touches pour des commandes. */
export const saisieOuverte = (): boolean => ouverte !== null;

const style = (e: HTMLElement, css: Record<string, string>): void => {
  for (const [k, v] of Object.entries(css)) e.style.setProperty(k, v);
};

function bouton(label: string, fond: string, act: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  style(b, {
    flex: '1',
    padding: '10px 6px',
    background: fond,
    color: '#fff',
    border: '2px solid #070914',
    'border-radius': '6px',
    font: 'bold 14px monospace',
  });
  b.addEventListener('click', act);
  return b;
}

export function ouvreSaisie(o: OptionsSaisie): void {
  ferme();
  const fond = document.createElement('div');
  style(fond, {
    position: 'fixed',
    inset: '0',
    'z-index': '20',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    background: 'rgba(7,9,20,0.85)',
  });
  const boite = document.createElement('div');
  style(boite, {
    width: 'min(320px, 86vw)',
    padding: '14px',
    background: '#151a38',
    border: '2px solid #2a3160',
    'border-radius': '8px',
    display: 'flex',
    'flex-direction': 'column',
    gap: '10px',
    color: '#fff',
    font: 'bold 14px monospace',
  });
  const titre = document.createElement('div');
  titre.textContent = o.titre;
  const champ = document.createElement('input');
  champ.type = 'text';
  champ.value = o.valeur;
  champ.maxLength = o.max;
  champ.autocomplete = 'off';
  champ.spellcheck = false;
  champ.setAttribute('autocapitalize', 'characters');
  style(champ, {
    padding: '10px',
    background: '#070914',
    color: '#ffd45a',
    border: '2px solid #3a4590',
    'border-radius': '6px',
    font: 'bold 20px monospace',
    'text-align': 'center',
  });
  const erreur = document.createElement('div');
  style(erreur, { color: '#ff7a90', 'min-height': '16px', 'text-align': 'center', 'font-size': '12px' });
  const valide = (): void => {
    const propre = o.valide(champ.value);
    if (propre === null) {
      erreur.textContent = o.erreur;
      return;
    }
    ferme();
    o.surValide(propre);
  };
  champ.addEventListener('input', () => {
    champ.value = o.filtre(champ.value).slice(0, o.max);
    erreur.textContent = '';
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') valide();
    else if (e.key === 'Escape') ferme();
  });
  const rangee = document.createElement('div');
  style(rangee, { display: 'flex', gap: '8px' });
  rangee.append(bouton('ANNULER', '#232a58', ferme), bouton('OK', '#24995c', valide));
  boite.append(titre, champ, erreur, rangee);
  fond.append(boite);
  document.body.append(fond);
  ouverte = fond;
  champ.focus();
  champ.select();
}

export function ferme(): void {
  ouverte?.remove();
  ouverte = null;
}
