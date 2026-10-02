/**
 * Bonus « givre » : l'écran de tout le monde se couvre de givre. L'image de
 * la patinoire est floutée (réduite puis agrandie avec lissage, ce qui marche
 * partout, sans `filter`), voilée de bleu, et des cristaux de glace en pixels
 * envahissent les bords, plus denses vers les coins.
 */
export class GivreEcran {
  /** Images de plus en plus petites (moitié, quart, huitième, seizième) : la chaîne du flou. */
  private niveaux: HTMLCanvasElement[] = [];
  private motif: HTMLCanvasElement | null = null;
  private tailleMotif = '';

  /**
   * Floute `ecran` : il est réduit par moitiés successives, puis ré-agrandi par
   * étapes. Une réduction d'un seul coup (14 fois) ne regarde qu'un pixel sur
   * quatorze : un joueur qui glisse d'un pixel à la fois apparaissait par
   * paliers de 14 pixels et clignotait. Réduire par moitiés moyenne tous les
   * pixels, le flou suit le mouvement sans à-coups. Renvoie l'image floue, à
   * la taille de `ecran`.
   */
  private floute(ecran: HTMLCanvasElement): HTMLCanvasElement {
    let source: HTMLCanvasElement = ecran;
    let w = ecran.width;
    let h = ecran.height;
    for (let i = 0; i < 4; i++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      const c = (this.niveaux[i] ??= document.createElement('canvas'));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const k = c.getContext('2d')!;
      k.imageSmoothingEnabled = true;
      k.globalAlpha = 1;
      k.drawImage(source, 0, 0, w, h);
      source = c;
    }
    // retour par étapes successives (seizième, huitième, quart, moitié) : un agrandissement
    // d'un coup ferait apparaître des blocs, et le flou avancerait par à-coups
    for (let i = 2; i >= 0; i--) {
      const c = this.niveaux[i]!;
      const k = c.getContext('2d')!;
      k.imageSmoothingEnabled = true;
      k.clearRect(0, 0, c.width, c.height);
      k.drawImage(source, 0, 0, c.width, c.height);
      source = c;
    }
    return source;
  }

  /**
   * `ecran` : le canvas déjà dessiné (patinoire), en pixels réels ; `W`×`H` :
   * taille logique ; `E` : échelle logique → réelle ; `force` : 0..1.
   */
  dessine(g: CanvasRenderingContext2D, ecran: HTMLCanvasElement, W: number, H: number, E: number, force: number, temps: number): void {
    if (force <= 0) return;
    // flou fort, calculé sur l'image réduite puis agrandi avec lissage par-dessus la patinoire
    const flou = this.floute(ecran);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.93 * force;
    g.drawImage(flou, 0, 0, ecran.width, ecran.height);
    g.globalAlpha = 0.22 * force;
    g.fillStyle = '#cdefff';
    g.fillRect(0, 0, ecran.width, ecran.height);
    g.restore();
    // cristaux sur les bords, en pixels logiques
    const cle = `${W}x${H}`;
    if (!this.motif || this.tailleMotif !== cle) {
      this.motif = motifGivre(W, H);
      this.tailleMotif = cle;
    }
    g.save();
    g.setTransform(E, 0, 0, E, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = force;
    g.drawImage(this.motif, 0, 0);
    // quelques éclats qui scintillent dans le givre
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      if (Math.floor(temps * 5 + i * 1.7) % 4 !== 0) continue;
      const bord = i % 4;
      const u = (i * 0.618) % 1;
      const p = ((i * 0.37) % 1) * 22;
      const x = bord === 0 ? p : bord === 1 ? W - 1 - p : u * W;
      const y = bord === 2 ? p : bord === 3 ? H - 1 - p : u * H;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    g.restore();
  }
}

/** Petit générateur pseudo-aléatoire : le même givre à chaque fois. */
function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le motif de givre (taille logique) : semis de cristaux vers les bords, et des branches qui poussent vers le centre. */
function motifGivre(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const k = c.getContext('2d')!;
  const r = hasard(7);
  const couleurs = ['#ffffff', '#eaf8ff', '#cdefff', '#a9dcf5'];
  const bord = Math.min(W, H) * 0.3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      // les coins gèlent plus que le milieu des bords
      const coin = Math.min(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
      const p = Math.max(0, 1 - d / bord) ** 2 * 0.7 + Math.max(0, 1 - coin / (bord * 2)) ** 2 * 0.5;
      if (r() < p) {
        k.globalAlpha = 0.55 + r() * 0.4;
        k.fillStyle = couleurs[Math.floor(r() * couleurs.length)]!;
        k.fillRect(x, y, 1, 1);
      }
    }
  }
  // branches de givre : des marches aléatoires qui partent des bords et se ramifient
  k.globalAlpha = 0.9;
  k.fillStyle = '#ffffff';
  const pousse = (x: number, y: number, a: number, n: number, profondeur: number) => {
    for (let i = 0; i < n; i++) {
      x += Math.cos(a);
      y += Math.sin(a);
      a += (r() - 0.5) * 0.5;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      k.fillRect(Math.round(x), Math.round(y), 1, 1);
      if (profondeur < 2 && r() < 0.08) pousse(x, y, a + (r() < 0.5 ? 0.9 : -0.9), Math.floor(n * 0.4), profondeur + 1);
    }
  };
  for (let i = 0; i < 46; i++) {
    const cote = i % 4;
    const u = r();
    const [x, y, a] =
      cote === 0 ? [0, u * H, 0] : cote === 1 ? [W - 1, u * H, Math.PI] : cote === 2 ? [u * W, 0, Math.PI / 2] : [u * W, H - 1, -Math.PI / 2];
    pousse(x, y, a + (r() - 0.5) * 0.8, 10 + Math.floor(r() * 24), 0);
  }
  return c;
}
