// Détourage des écussons sources (assets/logos-src/*.jpg).
//
// Les images fournies sont des JPEG, donc sans transparence : leur fond est
// soit une couleur pleine (blanc, noir), soit le damier gris/blanc qu'affichent
// les éditeurs d'image pour la « transparence » — incrusté dans les pixels.
// Un simple remplissage depuis les bords ne suffit pas pour le damier :
//   - des poches de damier sont enfermées à l'intérieur du dessin (entre une
//     nageoire et le contour, par exemple) et ne touchent jamais le bord ;
//   - la compression JPEG floute les jointures entre cases : ces traits
//     intermédiaires bloquent la propagation et laissent une grille fantôme.
// On reconstruit donc la grille du damier (pas et décalage, mesurés sur le
// pourtour) pour savoir, en tout point, quelle couleur de fond « devrait »
// s'y trouver. Tout ce qui correspond est du fond, qu'il touche le bord ou
// non, pourvu que la zone couvre des cases claires ET foncées (un aplat blanc
// du dessin, lui, ne colle qu'aux cases claires).

function distanceCouleur(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const luminance = (r, g, b) => (r + g + b) / 3;
const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

/** Échantillonne le pourtour pour deviner la ou les couleurs de fond (une
 * couleur pleine, ou deux qui alternent en damier). */
function detecteCouleursFond(data, w, h) {
  const echantillons = [];
  for (let x = 0; x < w; x += 3) echantillons.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y += 3) echantillons.push([0, y], [w - 1, y]);
  const couleurs = [];
  for (const [x, y] of echantillons) {
    const i = (y * w + x) * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const trouve = couleurs.find((c) => distanceCouleur(r, g, b, c.r, c.g, c.b) < 30);
    if (trouve) trouve.n++;
    else couleurs.push({ r, g, b, n: 1 });
  }
  couleurs.sort((a, b) => b.n - a.n);
  // les couleurs de fond dominent largement le pourtour ; on ignore les
  // échantillons isolés qui tombent sur le dessin.
  return couleurs.filter((c) => c.n >= echantillons.length * 0.03).slice(0, 2);
}

/** Composantes 4-connexes des pixels marqués (masque 0/1). */
function composantes(masque, w, h) {
  const etiquette = new Int32Array(w * h).fill(-1);
  const file = new Int32Array(w * h);
  const liste = [];
  for (let depart = 0; depart < w * h; depart++) {
    if (!masque[depart] || etiquette[depart] >= 0) continue;
    const id = liste.length;
    let n = 0;
    let tete = 0;
    file[n++] = depart;
    etiquette[depart] = id;
    let bord = false;
    while (tete < n) {
      const idx = file[tete++];
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bord = true;
      const voisins = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const v of voisins) {
        if (v >= 0 && masque[v] && etiquette[v] < 0) {
          etiquette[v] = id;
          file[n++] = v;
        }
      }
    }
    liste.push({ pixels: file.slice(0, n), bord });
  }
  return liste;
}

// ------------------------------------------------------- fond uni ----------

function retireFondUni(data, w, h, fonds) {
  const SEUIL = 34;
  const masque = new Uint8Array(w * h);
  for (let idx = 0; idx < w * h; idx++) {
    const i = idx * 4;
    masque[idx] = fonds.some((c) => distanceCouleur(data[i], data[i + 1], data[i + 2], c.r, c.g, c.b) < SEUIL)
      ? 1
      : 0;
  }
  // sur fond uni, seul ce qui touche le bord est du fond : un aplat blanc
  // enfermé dans un logo sur fond blanc fait partie du dessin.
  for (const c of composantes(masque, w, h)) {
    if (!c.bord) continue;
    for (const idx of c.pixels) data[idx * 4 + 3] = 0;
  }
  // Liseré : la compression JPEG (et, sur fond vert/bleu saturé, la fuite de
  // chrominance classique du « chroma key ») mélange quelques pixels de
  // contour avec le fond. On grignote encore, pixel opaque par pixel opaque
  // collé à une zone déjà transparente, selon deux critères complémentaires :
  //  - proche en couleur du fond (marge plus large qu'à la détection initiale) ;
  //  - sur un fond nettement saturé (vert/bleu franc), une « fuite » de sa
  //    composante dominante — même très éclaircie ou mélangée à un premier
  //    plan coloré, une teinte verte qui déborde reste reconnaissable.
  const SEUIL_LISERE = SEUIL * 2.2;
  const fond0 = fonds[0];
  const canaux = [fond0.r, fond0.g, fond0.b];
  const domIdx = canaux.indexOf(Math.max(...canaux));
  const chromaFond = Math.max(...canaux) - Math.min(...canaux);
  const FUITE_SEUIL = 14;
  const estFuite = (r, g, b) => {
    if (chromaFond < 60) return false; // fond peu saturé (blanc/noir/gris) : pas de fuite de teinte à traquer
    const val = [r, g, b];
    const dom = val[domIdx];
    const autres = val.filter((_, i) => i !== domIdx);
    return dom - Math.max(...autres) > FUITE_SEUIL;
  };
  // le dégradé anti-crénelage peut s'étaler sur une quinzaine de pixels
  // (image source lissée) : assez de passes pour ronger tout le dégradé,
  // avec un arrêt dès qu'une passe ne retire plus rien.
  for (let passe = 0; passe < 24; passe++) {
    const aRetirer = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (data[idx * 4 + 3] === 0) continue;
        const i = idx * 4;
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        const proche = fonds.some((c) => distanceCouleur(r, g, b, c.r, c.g, c.b) < SEUIL_LISERE);
        if (!proche && !estFuite(r, g, b)) continue;
        const voisins = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
        ];
        if (voisins.some((v) => v >= 0 && data[v * 4 + 3] === 0)) aRetirer.push(idx);
      }
    }
    if (aRetirer.length === 0) break;
    for (const idx of aRetirer) data[idx * 4 + 3] = 0;
  }

  // Poussière : un pixel (ou une poignée) resté isolé au beau milieu du fond
  // déjà retiré — coloré ni assez près du fond, ni assez « en fuite » pour
  // les passes ci-dessus, mais trop petit pour être un vrai trait du dessin.
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opaque[i] = data[i * 4 + 3] ? 1 : 0;
  for (const comp of composantes(opaque, w, h)) {
    if (comp.bord || comp.pixels.length > 30) continue;
    const fondLike = comp.pixels.every((idx) => {
      const i = idx * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      return fonds.some((c) => distanceCouleur(r, g, b, c.r, c.g, c.b) < SEUIL_LISERE) || estFuite(r, g, b);
    });
    if (!fondLike) continue;
    for (const idx of comp.pixels) data[idx * 4 + 3] = 0;
  }
}

// ------------------------------------------------------- damier ------------

/**
 * Mesure la grille du damier sur un axe à partir de bandes de pixels prises
 * le long du bord (où il n'y a que du fond) : positions des changements de
 * case, puis ajustement aux moindres carrés `frontiere = a + s·k`.
 * Renvoie null si le motif est introuvable.
 */
function mesureGrille(lignes, milieu) {
  // lignes : tableaux de luminances (null = pixel qui n'est pas du fond)
  const frontieres = [];
  for (const ligne of lignes) {
    let dernier = -1;
    let etat = null;
    for (let x = 0; x < ligne.length; x++) {
      const l = ligne[x];
      if (l === null) continue;
      const e = l > milieu;
      if (etat !== null && e !== etat && x - dernier <= 4) frontieres.push((x + dernier) / 2);
      etat = e;
      dernier = x;
    }
  }
  if (frontieres.length < 8) return null;
  frontieres.sort((a, b) => a - b);
  // regroupe les détections quasi identiques des différentes lignes
  const groupes = [];
  for (const f of frontieres) {
    const g = groupes[groupes.length - 1];
    if (g && f - g.max <= 2.5) {
      g.somme += f;
      g.n++;
      g.max = f;
    } else groupes.push({ somme: f, n: 1, max: f });
  }
  const pos = groupes.filter((g) => g.n >= 2).map((g) => g.somme / g.n);
  if (pos.length < 6) return null;
  const ecarts = [];
  for (let i = 1; i < pos.length; i++) ecarts.push(pos[i] - pos[i - 1]);
  ecarts.sort((a, b) => a - b);
  let s = ecarts[ecarts.length >> 1];
  let a = pos[0];
  // deux passes : ajustement, puis ré-ajustement sans les valeurs aberrantes
  for (let passe = 0; passe < 3; passe++) {
    const pts = pos
      .map((p) => ({ k: Math.round((p - a) / s), p }))
      .filter(({ k, p }) => Math.abs(p - (a + k * s)) < s / 4);
    if (pts.length < 4) return null;
    const n = pts.length;
    const mk = pts.reduce((t, q) => t + q.k, 0) / n;
    const mp = pts.reduce((t, q) => t + q.p, 0) / n;
    let num = 0;
    let den = 0;
    for (const q of pts) {
      num += (q.k - mk) * (q.p - mp);
      den += (q.k - mk) ** 2;
    }
    if (den === 0) return null;
    s = num / den;
    a = mp - s * mk;
  }
  return s > 3 ? { a, s } : null;
}

function retireDamier(data, w, h, clair, fonce) {
  const LA = luminance(clair.r, clair.g, clair.b);
  const LB = luminance(fonce.r, fonce.g, fonce.b);
  const milieu = (LA + LB) / 2;
  const tolerance = Math.max(18, (LA - LB) * 0.45);
  const L = (idx) => luminance(data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2]);
  const C = (idx) => chroma(data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2]);
  const estGrisFond = (idx) =>
    C(idx) < 24 && (Math.abs(L(idx) - LA) < tolerance || Math.abs(L(idx) - LB) < tolerance);
  const echantillon = (idx) => (estGrisFond(idx) ? L(idx) : null);

  const BANDE = 6;
  const lignesX = [];
  const lignesY = [];
  for (let k = 1; k <= BANDE; k++) {
    for (const y of [k, h - 1 - k]) lignesX.push(Array.from({ length: w }, (_, x) => echantillon(y * w + x)));
    for (const x of [k, w - 1 - k]) lignesY.push(Array.from({ length: h }, (_, y) => echantillon(y * w + x)));
  }
  const gx = mesureGrille(lignesX, milieu);
  const gy = mesureGrille(lignesY, milieu);
  if (!gx || !gy) return false;

  const caseDe = (v, g) => Math.floor((v - g.a) / g.s);
  const distJointure = (v, g) => {
    const r = ((((v - g.a) / g.s) % 1) + 1) % 1;
    return Math.min(r, 1 - r) * g.s;
  };
  // parité : quelle case est claire ? vote sur le pourtour
  let votes = 0;
  for (let k = 1; k <= BANDE; k++) {
    for (let x = 0; x < w; x++) {
      for (const y of [k, h - 1 - k]) {
        const idx = y * w + x;
        if (!estGrisFond(idx) || distJointure(x, gx) < 2 || distJointure(y, gy) < 2) continue;
        const pair = (caseDe(x, gx) + caseDe(y, gy)) % 2 === 0;
        votes += L(idx) > milieu === pair ? 1 : -1;
      }
    }
  }
  const pairEstClair = votes >= 0;
  // la bande floutée autour des jointures s'élargit avec la taille des cases
  // (image agrandie avant compression)
  const jx = Math.max(2.2, gx.s * 0.09);
  const jyMax = Math.max(2.2, gy.s * 0.09);
  const aireCase = Math.max(1, gx.s - 2 * jx) * Math.max(1, gy.s - 2 * jyMax);

  // 0 = dessin, 1 = case claire, 2 = case foncée, 3 = jointure floutée,
  // 4 = gris clair qui ne tombe pas sur la bonne case
  const type = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const jy = distJointure(y, gy) < jyMax;
    const cy = caseDe(y, gy);
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (C(idx) >= 26) continue;
      const l = L(idx);
      if (jy || distJointure(x, gx) < jx) {
        if (l >= LB - 22 && l <= LA + 12) type[idx] = 3;
        continue;
      }
      const clairAttendu = ((caseDe(x, gx) + cy) % 2 === 0) === pairEstClair;
      if (clairAttendu && Math.abs(l - LA) < tolerance) type[idx] = 1;
      else if (!clairAttendu && Math.abs(l - LB) < tolerance) type[idx] = 2;
      else if (l >= LB - 22 && l <= LA + 12) type[idx] = 4;
    }
  }
  const masque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) masque[i] = type[i] ? 1 : 0;
  for (const c of composantes(masque, w, h)) {
    let nClair = 0;
    let nFonce = 0;
    for (const idx of c.pixels) {
      if (type[idx] === 1) nClair++;
      else if (type[idx] === 2) nFonce++;
    }
    const nCases = nClair + nFonce;
    // une zone de fond enfermée couvre les deux sortes de cases ; un aplat
    // blanc (ou gris) du dessin ne colle qu'à l'une d'elles.
    // Il faut aussi plusieurs cases de chaque sorte : un œil ou des dents en
    // pixel art (blanc + gris, pixels de la taille des cases) ne doivent pas
    // passer pour une poche de damier.
    const damier =
      nCases > 0 && Math.min(nClair, nFonce) / nCases >= 0.2 && Math.min(nClair, nFonce) >= 2 * aireCase;
    if (!c.bord && !damier) continue;
    for (const idx of c.pixels) data[idx * 4 + 3] = 0;
  }

  // Finitions : liseré gris clair laissé par l'anticrénelage le long des
  // zones retirées, puis poussières claires isolées (reste de jointure).
  const estClairNeutre = (idx) => C(idx) < 30 && L(idx) >= LB - 40;
  for (let passe = 0; passe < 2; passe++) {
    const aRetirer = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (data[idx * 4 + 3] === 0 || !estClairNeutre(idx)) continue;
        if (
          data[(idx - 1) * 4 + 3] === 0 ||
          data[(idx + 1) * 4 + 3] === 0 ||
          data[(idx - w) * 4 + 3] === 0 ||
          data[(idx + w) * 4 + 3] === 0
        )
          aRetirer.push(idx);
      }
    }
    for (const idx of aRetirer) data[idx * 4 + 3] = 0;
  }
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opaque[i] = data[i * 4 + 3] ? 1 : 0;
  const seuilPoussiere = w * h * 0.0004;
  for (const c of composantes(opaque, w, h)) {
    if (c.pixels.length >= seuilPoussiere) continue;
    let clairs = 0;
    for (const idx of c.pixels) if (estClairNeutre(idx)) clairs++;
    if (clairs / c.pixels.length < 0.6) continue;
    for (const idx of c.pixels) data[idx * 4 + 3] = 0;
  }
  return true;
}

/** Rend transparent le fond d'une image (ImageData modifiée en place). */
/**
 * Grignote la silhouette d'exactement 1px partout : quel que soit le fond,
 * une compression JPEG mélange toujours un peu ses pixels de contour avec
 * le fond sur cette épaisseur (halo de « spill » que les passes ci-dessus ne
 * rattrapent pas forcément, notamment sur un fond très saturé comme un fond
 * vert où teinte et dominance de canal ne suffisent pas à isoler le mélange
 * d'une couleur d'avant-plan qui partage elle-même un canal bas avec le
 * fond). Un pixel de perdu sur des écussons de 1000px+ est invisible une
 * fois réduits à leur taille d'affichage ; c'est le compromis le plus sûr,
 * indépendant de la couleur exacte du fond ou du dessin.
 */
function erodeSilhouette(data, w, h) {
  const transparent = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) transparent[i] = data[i * 4 + 3] === 0 ? 1 : 0;
  const aRetirer = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (transparent[idx]) continue;
      const voisins = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      if (voisins.some((v) => v >= 0 && transparent[v])) aRetirer.push(idx);
    }
  }
  for (const idx of aRetirer) data[idx * 4 + 3] = 0;
}

export function detoure(imgData) {
  const { data, width: w, height: h } = imgData;
  const fonds = detecteCouleursFond(data, w, h);
  let mode;
  if (fonds.length === 2) {
    const [c1, c2] = fonds;
    const neutres = chroma(c1.r, c1.g, c1.b) < 20 && chroma(c2.r, c2.g, c2.b) < 20;
    const l1 = luminance(c1.r, c1.g, c1.b);
    const l2 = luminance(c2.r, c2.g, c2.b);
    if (neutres && Math.abs(l1 - l2) >= 25) {
      const [clair, fonce] = l1 > l2 ? [c1, c2] : [c2, c1];
      if (retireDamier(data, w, h, clair, fonce)) mode = 'damier';
    }
  }
  if (!mode) {
    retireFondUni(data, w, h, fonds);
    mode = 'uni';
  }
  erodeSilhouette(data, w, h);
  return mode;
}
