"""Chutes (défenseur esquivé) : plongeon, puis joueur allongé."""
from sources.commun import *  # noqa: F401,F403


# --- Chutes (défenseur esquivé) -------------------------------------------------

# Plongeon puis joueur allongé, tête à droite, crosse lâchée au sol (une
# composante à part dans la source).
CHUTES = ['chute-plongeon', 'chute-allonge']
# Par image (coordonnées du dessin pixelisé) : casque, visage, gants et culotte.
ZONES_CHUTE = [
    {'casque': (85, 16, 114, 39), 'visage': (86, 32, 116, 62),
     'gants': [(131, 41, 158, 63), (61, 58, 97, 82)], 'culotte': (27, 23, 57, 45)},
    {'casque': (111, 12, 137, 40), 'visage': (107, 30, 130, 54),
     'gants': [(147, 27, 173, 50), (76, 45, 111, 73)], 'culotte': (37, 12, 67, 40)},
]


def chutes():
    dessins = []
    for nom in CHUTES:
        im = np.asarray(Image.open(SRC / f'{nom}.jpg').convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        fg = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
        dessins.append(pixelise(im, fg, PERIODE_GARDIEN))
    dessins = quantifie(dessins)
    sorties = []
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    for a, z in zip(dessins, ZONES_CHUTE):
        detoure_violet(a)
        comp, n = ndimage.label(a[..., 3] > 0)
        tailles = ndimage.sum(np.ones_like(comp), comp, range(1, n + 1))
        corps = comp == (np.argmax(tailles) + 1)
        H, W = a.shape[:2]
        roles = np.zeros((H, W), np.uint8)
        for y in range(H):
            for x in range(W):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, False)
                rouge = r == R['maillot']
                if not corps[y, x]:
                    r = R['garde']  # la crosse lâchée
                elif r == R['contour']:
                    pass
                elif dans(x, y, z['casque']):
                    # casque rouge et doré ; visière et peau telles quelles
                    r = R['casque'] if rouge else R['casque-bande'] if r == R['bande'] else R['garde']
                elif dans(x, y, z['visage']):
                    r = R['garde']  # visage (peau, barbe, bouche) tel quel
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                        (8 <= h <= 35 and v < 0.72) or (rouge and v < 0.55)):
                    r = R['gants']
                elif dans(x, y, z['culotte']):
                    if rouge and (v < 0.5 or h > 12):
                        r = R['garde']  # ombres de la culotte brune
                elif r == R['blanc'] and 160 <= h <= 230:
                    r = R['garde']  # lames des patins, gris bleuté
                elif r == R['garde'] and (h <= 26 or h >= 330) and s > 0.45:
                    r = R['maillot']  # ombres brun-rouge du maillot (dos, épaules)
                roles[y, x] = r
        nettoie(roles)
        sorties.append((a, roles, corps))
    return sorties
