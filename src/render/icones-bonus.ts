import type { PouvoirId } from '@core/types';
import { px } from './primitives';

const COUL: Record<string, string> = {
  o: '#ff8a2a',
  y: '#ffd35c',
  w: '#ffffff',
  r: '#e84a5f',
  k: '#20243a',
  g: '#8a93b0',
  c: '#8fe3ff',
  b: '#2f6fdb',
  p: '#ff9ad2',
  n: '#c0508a',
  e: '#5ee08a',
  m: '#b07cff',
};

/** Icônes des bonus, en grilles de 12×12 (une lettre = une couleur de COUL, « . » = transparent). */
const ICONES: Record<PouvoirId | 'inconnu', string[]> = {
  // palet qui file vers une cible
  guide: ['.......rrrr.', '......rwwwwr', '......rwrrwr', '......rwrrwr', '......rwwwwr', '....y..rrrr.', '...y........', '..y.........', '..y.........', '.kkk........', 'kkkkk.......', '.kkk........'],
  // éclair
  vitesse: ['......yyyy..', '.....yyyy...', '....yyyy....', '...yyyy.....', '..yyyyyyy...', '.....yyyy...', '....yyyy....', '...yyy......', '..yyy.......', '.yy.........', 'y...........', '............'],
  // palet en feu
  puissant: ['............', '.o..o.......', 'oyo.oo......', 'oyyooyo.....', '.oyyyyyo....', '..oyywyyo...', '...oyyykkkk.', '....oykkkkkk', '.....kkkkkkk', '.....kgkkkgk', '......kkkkk.', '............'],
  // flocon
  freeze: ['.....c......', '..c..c..c...', '...c.c.c....', '....ccc.....', '.c..cwc..c..', 'ccccwwwcccc.', '.c..cwc..c..', '....ccc.....', '...c.c.c....', '..c..c..c...', '.....c......', '............'],
  // savon et bulles
  savon: ['........ww..', '..ww...w..w.', '.w..w..w..w.', '.w..w...ww..', '..ww........', '.pppppppppp.', 'pwwppppppppp', 'pwppppppppnp', 'ppppppppppnp', '.pppppppppn.', '..nnnnnnnn..', '............'],
  // flèches opposées
  inversion: ['............', '..m.........', '.mm.........', 'mmmmmmmmmm..', '.mm.........', '..m.........', '.........m..', '.........mm.', '..mmmmmmmmmm', '.........mm.', '.........m..', '............'],
  // zigzag entre deux bandes
  ricochet: ['g..........g', 'gc.........g', 'g.c.......cg', 'g..c.....c.g', 'g...c...c..g', 'g....c.c...g', 'g.....c....g', 'g....c.c...g', 'g...c...c..g', 'g..c.....kkg', 'g.c......kkg', 'gc.........g'],
  // +1
  surnombre: ['............', '.........ee.', '...e....eee.', '...e.....ee.', '.eeeee...ee.', '...e.....ee.', '...e.....ee.', '.........ee.', '........eeee', '............', '............', '............'],
  // -1
  gamelle: ['............', '.........rr.', '........rrr.', '.........rr.', '.rrrrr...rr.', '.........rr.', '.........rr.', '.........rr.', '........rrrr', '............', '............', '............'],
  // 2X
  double: ['............', '.yyy..y...y.', 'y...y.y...y.', '....y..y.y..', '...y....y...', '..y....y.y..', '.y....y...y.', 'yyyyy.y...y.', '............', '............', '............', '............'],
  // bonus pas encore tiré
  inconnu: ['............', '....gggg....', '...gg..gg...', '...gg..gg...', '.......gg...', '......gg....', '.....gg.....', '.....gg.....', '............', '.....gg.....', '.....gg.....', '............'],
};

/** Dessine l'icône d'un bonus, centrée en (cx, cy), sur `taille` px de côté. */
export function dessineIconeBonus(g: CanvasRenderingContext2D, id: PouvoirId | 'inconnu', cx: number, cy: number, taille: number): void {
  const k = taille / 12;
  const x0 = cx - taille / 2;
  const y0 = cy - taille / 2;
  ICONES[id].forEach((ligne, j) => {
    for (let a = 0; a < ligne.length; a++) {
      const c = COUL[ligne[a]!];
      if (c) px(g, x0 + a * k, y0 + j * k, Math.ceil(k), Math.ceil(k), c);
    }
  });
}
