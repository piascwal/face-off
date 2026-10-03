"""Trophée du mode coupe."""
from sources.commun import *  # noqa: F401,F403


# --- Trophée (mode coupe) ---------------------------------------------------------


def coupe():
    """La coupe du tableau (mode coupe) : détourée, pixelisée, 64 couleurs, telle quelle."""
    im = np.asarray(Image.open(SRC / 'coupe.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    tailles = ndimage.sum(fg, lab, range(1, n + 1))
    fg = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
    a = quantifie([pixelise(im, fg, periode(im, fg))])[0]
    detoure_violet(a, s_min=0.15)
    return a
