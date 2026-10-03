"""Mise en échec : le coup d'épaule."""
from sources.commun import *  # noqa: F401,F403


# --- Mise en échec (une seule image : le coup d'épaule) -------------------------------

# Dessinée sur la même échelle que les autres sources : pas d'élargissement.
# Coordonnées après découpe : casque, visage, gants, culotte, patins, écusson, et la
# crosse en segments : hors du corps elle garde ses couleurs (`dehors`), devant le
# corps seulement là où elle est brune (`manche`).
ZONES_ECHEC = {
    'casque': (66, 0, 92, 16), 'visage': (68, 14, 91, 32),
    'gants': [(15, 22, 38, 48), (76, 49, 101, 71)],
    'culotte': (28, 60, 78, 82), 'ecusson': (60, 41, 78, 52),
    'patins': [(0, 90, 18, 109), (52, 90, 80, 109)],
    'dehors': [(0, 30, 16, 37), (96, 66, 118, 75), (118, 75, 134, 61), (130, 61, 137, 57)],
    'manche': [(16, 37, 97, 66)],
}


def echec():
    """L'image de la mise en échec, pixelisée, et sa carte de rôles."""
    im = np.asarray(Image.open(SRC / 'echec.jpg').convert('RGB')).astype(float)
    fond = np.median(im[:30, :30].reshape(-1, 3), 0)
    fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
    lab, n = ndimage.label(fg)
    tailles = ndimage.sum(fg, lab, range(1, n + 1))
    masque = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
    (a,) = quantifie([pixelise(im, masque, PERIODE_GARDIEN)])
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3]:
                h, s, v = hsv(a[y, x, :3])
                if 280 <= h <= 340 and s > 0.4 and v > 0.4:
                    a[y, x, 3] = 0  # le fond magenta, aussi dans les trous fermés
    detoure_violet(a)
    ys, xs = np.where(a[..., 3] > 0)
    a = np.ascontiguousarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    z = ZONES_ECHEC
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    roles = np.zeros(a.shape[:2], np.uint8)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            r = role_couleur(h, s, v, dans(x, y, z['casque']))
            rouge = r == R['maillot']
            brun = 8 <= h <= 35
            if r == R['contour']:
                pass
            elif any(dist_seg(x, y, *seg) <= 3.5 for seg in z['dehors']):
                r = R['garde']
            elif any(dist_seg(x, y, *seg) <= 2.2 for seg in z['manche']) and brun and r != R['bande']:
                r = R['garde']
            elif dans(x, y, z['casque']):
                pass
            elif dans(x, y, z['visage']):
                chaud = h <= 40 or h >= 330
                if (h >= 345 or h <= 8) and s > 0.8 and v > 0.35:
                    r = R['maillot']
                elif chaud and 0.2 <= v < 0.5 and s >= 0.3:
                    r = R['barbe']
                elif chaud and v >= 0.4 and s >= 0.12:
                    r = R['peau']
                else:
                    r = R['garde']
            elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                    (brun and v < 0.72) or (rouge and v < 0.55)):
                r = R['gants']
            elif any(dans(x, y, p) for p in z['patins']) and r in (R['blanc'], R['maillot'], R['bande']):
                r = R['garde']
            elif dans(x, y, z['culotte']) and rouge and (v < 0.5 or h > 12):
                r = R['garde']
            roles[y, x] = r
    x0, y0, x1, y1 = z['ecusson']
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if a[y, x, 3] and roles[y, x] not in (R['contour'], R['garde'], R['gants']):
                roles[y, x] = R['ecusson']
    nettoie(roles)
    return a, roles
