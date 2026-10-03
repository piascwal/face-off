"""Les quatre images du geste de tir."""
from sources.commun import *  # noqa: F401,F403


# --- Tir (armé, descente, impact, accompagnement) --------------------------------

# Les 4 images de tir, dessinées sur un même fond et déjà calées entre elles
# (patins au même endroit) : on garde ce calage en les pixelisant sur une seule
# grille. Le dessin est plus élancé que la planche de patinage : on l'élargit
# (colonnes répétées, au plus proche voisin) pour retrouver la même carrure.
TIRS = ['tir/tir-1', 'tir/tir-2', 'tir/tir-3', 'tir/tir-4']
ELARGISSEMENT_TIR = 1.18
# Par image (coordonnées après élargissement) : casque, visage, gants, culotte
# (repeinte comme le maillot, à l'image du patinage), patins, écusson, et la crosse en segments épais (x0, y0, x1, y1) : hors du corps elle
# garde ses couleurs (`dehors`), devant le corps seulement là où elle est brune (`manche`).
ZONES_TIR = [
    {'casque': (84, 14, 116, 31), 'visage': (87, 29, 111, 50), 'gants': [(25, 23, 51, 47), (47, 47, 75, 71)],
     'culotte': (46, 69, 96, 93), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(5, 0, 9, 14), (9, 14, 24, 31)], 'manche': [(30, 31, 58, 56)]},
    {'casque': (84, 14, 116, 31), 'visage': (87, 29, 111, 50), 'gants': [(31, 45, 53, 73), (59, 53, 89, 79)],
     'culotte': (46, 69, 96, 93), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(1, 51, 31, 63), (53, 64, 60, 64)], 'manche': [(33, 64, 86, 64)]},
    {'casque': (88, 16, 118, 36), 'visage': (88, 30, 112, 52), 'gants': [(37, 27, 59, 56), (83, 69, 105, 93)],
     'culotte': (46, 69, 96, 93), 'ecusson': (70, 55, 88, 68), 'patins': [(15, 92, 52, 120), (68, 97, 98, 120)],
     'dehors': [(98, 88, 130, 109), (128, 104, 153, 106)], 'manche': [(54, 50, 98, 88)]},
    {'casque': (88, 16, 118, 36), 'visage': (88, 30, 112, 52), 'gants': [(109, 37, 131, 59), (58, 51, 84, 71)],
     'culotte': (44, 69, 96, 91), 'patins': [(6, 72, 44, 100), (68, 97, 98, 120)],
     'dehors': [(116, 53, 148, 35), (147, 36, 151, 8)], 'manche': [(38, 73, 124, 44)]},
]


def tirs():
    """Les 4 images de tir pixelisées sur une grille commune, élargies, et leurs cartes de rôles."""
    ims, masques = [], []
    for nom in TIRS:
        im = np.asarray(Image.open(SRC / f'{nom}.jpg').convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        ims.append(im)
        masques.append(ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000])))
    P = PERIODE_GARDIEN

    def calage(s):
        ph = np.linspace(0, P, 40, endpoint=False)
        sc = [np.interp(np.arange(p, len(s) - 1, P), np.arange(len(s)), s).mean() for p in ph]
        return ph[int(np.argmax(sc))] + 0.5

    gx = sum((np.abs(np.diff(im.mean(2), axis=1)) * m[:, 1:]).sum(0) for im, m in zip(ims, masques))
    gy = sum((np.abs(np.diff(im.mean(2), axis=0)) * m[1:, :]).sum(1) for im, m in zip(ims, masques))
    x0, y0 = calage(gx), calage(gy)
    H, W = ims[0].shape[:2]
    nx, ny = int((W - x0) / P), int((H - y0) / P)
    dessins = []
    for im, m in zip(ims, masques):
        out = np.zeros((ny, nx, 4))
        for j in range(ny):
            for i in range(nx):
                ya, xa = y0 + j * P, x0 + i * P
                sy = slice(int(round(ya)), max(int(round(ya)) + 1, int(round(ya + P))))
                sx = slice(int(round(xa)), max(int(round(xa)) + 1, int(round(xa + P))))
                bm = m[sy, sx].reshape(-1)
                if bm.mean() < 0.5:
                    continue
                out[j, i, :3] = np.median(im[sy, sx].reshape(-1, 3)[bm], 0)
                out[j, i, 3] = 255
        dessins.append(out)
    dessins = quantifie(dessins)
    for a in dessins:
        # le fond magenta, aussi dans les trous fermés (entre le bras et le corps, dans les patins)
        for y in range(a.shape[0]):
            for x in range(a.shape[1]):
                if a[y, x, 3]:
                    h, s, v = hsv(a[y, x, :3])
                    if 280 <= h <= 340 and s > 0.4 and v > 0.4:
                        a[y, x, 3] = 0
        detoure_violet(a)
    opaque = np.stack([a[..., 3] > 0 for a in dessins]).any(0)
    ys, xs = np.where(opaque)
    dessins = [a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] for a in dessins]
    w = dessins[0].shape[1]
    cols = np.minimum(w - 1, (np.arange(int(round(w * ELARGISSEMENT_TIR))) / ELARGISSEMENT_TIR).astype(int))
    dessins = [np.ascontiguousarray(a[:, cols]) for a in dessins]
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    sorties = []
    for a, z in zip(dessins, ZONES_TIR):
        H2, W2 = a.shape[:2]
        roles = np.zeros((H2, W2), np.uint8)
        for y in range(H2):
            for x in range(W2):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, dans(x, y, z['casque']))
                rouge = r == R['maillot']
                brun = 8 <= h <= 35
                if r == R['contour']:
                    pass
                elif any(dist_seg(x, y, *seg) <= 4.5 for seg in z['dehors']):
                    r = R['garde']  # la crosse hors du corps garde ses couleurs
                elif any(dist_seg(x, y, *seg) <= 2.2 for seg in z['manche']) and brun and r != R['bande']:
                    r = R['garde']  # le manche, là où il passe devant le corps
                elif dans(x, y, z['casque']):
                    pass
                elif dans(x, y, z['visage']):
                    # visage : peau et barbe (variantes par joueur), le reste tel quel
                    chaud = h <= 40 or h >= 330
                    if (h >= 345 or h <= 8) and s > 0.8 and v > 0.35:
                        r = R['maillot']  # col du maillot, sous la barbe
                    elif chaud and 0.2 <= v < 0.5 and s >= 0.3:
                        r = R['barbe']
                    elif chaud and v >= 0.4 and s >= 0.12:
                        r = R['peau']
                    else:
                        r = R['garde']
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and brun and v < 0.72:
                    r = R['gants']  # le cuir brun (les ombres rouges autour restent du maillot)
                elif any(dans(x, y, p) for p in z['patins']) and r in (R['blanc'], R['maillot'], R['bande']):
                    r = R['garde']  # patins : lames, lacets et surpiqûres
                roles[y, x] = r
        # écusson de l'équipe sur la poitrine, là où le dessin a son emblème (torse de face)
        if 'ecusson' in z:
            x0, y0, x1, y1 = z['ecusson']
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if a[y, x, 3] and roles[y, x] not in (R['contour'], R['garde'], R['gants']):
                        roles[y, x] = R['ecusson']
        nettoie(roles)
        sorties.append((a, roles))
    return sorties
