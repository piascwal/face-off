"""Célébrations de l'écran de but."""
from sources.commun import *  # noqa: F401,F403


# --- Célébrations (écran de but) -------------------------------------------------

# Un joueur qui fête un but, de face, sur fond magenta : chaque image
# `celebration-<n>.jpg` rejoint le tirage au sort de l'écran de but. Par image
# (coordonnées du dessin pixelisé) : casque, visage, gants, culotte et crosse
# (segments du manche, palette comprise).
# `ext` : extension de la source ; `periode` : grille du dessin (les sources
# plus grandes sont un peu plus fines) ; `rayon` : demi-épaisseur de la crosse
# (un segment peut avoir la sienne en 5e valeur).
CELEBRATIONS = [
    {'nom': 'celebration-1', 'casque': (24, 22, 46, 34), 'visage': (27, 33, 44, 47),
     'gants': [(1, 15, 18, 33), (60, 19, 76, 34)], 'culotte': (29, 69, 69, 87),
     'crosse': [(46, 2, 60, 7), (60, 7, 70, 22), (70, 30, 82, 57)]},
    # à genou, poing levé
    {'nom': 'celebration-2', 'ext': 'png', 'periode': 5.6, 'rayon': 3,
     'casque': (32, 10, 52, 24), 'visage': (34, 23, 52, 41),
     'gants': [(7, 0, 23, 21), (78, 55, 92, 72)], 'culotte': (30, 70, 82, 92),
     'crosse': [(90, 66, 118, 72), (116, 72, 131, 58)]},
    # crosse brandie au-dessus de la tête
    {'nom': 'celebration-3', 'ext': 'png', 'periode': 5.6, 'rayon': 2.8,
     'casque': (44, 24, 67, 36), 'visage': (46, 35, 66, 57),
     'gants': [(14, 10, 31, 31), (82, 9, 97, 31)], 'culotte': (40, 82, 80, 104),
     'crosse': [(1, 17, 110, 15), (108, 15, 122, 2)]},
    # bras écartés
    {'nom': 'celebration-4', 'ext': 'png', 'periode': 5.6, 'rayon': 3.6,
     'casque': (47, 24, 69, 38), 'visage': (50, 34, 69, 56),
     'gants': [(0, 31, 20, 52), (100, 34, 124, 55)], 'culotte': (44, 82, 78, 104),
     'crosse': [(119, 1, 126, 14), (123, 14, 106, 78)]},
    # la crosse jouée comme une guitare (le manche traverse le maillot : tracé fin)
    {'nom': 'celebration-5', 'casque': (10, 0, 26, 15), 'visage': (12, 3, 36, 31),
     'gants': [(13, 33, 43, 54), (55, 31, 75, 49)], 'culotte': (13, 58, 45, 80),
     'crosse': [(32, 37, 92, 37, 1.6), (90, 37, 100, 20, 3.5)]},
    # la main sur le cœur, crosse levée
    {'nom': 'celebration-6', 'casque': (10, 0, 26, 22), 'visage': (12, 3, 36, 31),
     'gants': [(13, 32, 36, 50), (58, 37, 80, 53)], 'culotte': (13, 62, 50, 82),
     'crosse': [(76, 18, 74, 85, 2.8), (65, 1, 77, 15, 3.5)]},
    # barbu, un gant pointé vers la foule, l'autre poing levé (sans crosse)
    {'nom': 'celebration-7', 'periode': 5.5, 'casque': (52, 0, 78, 16), 'visage': (53, 14, 78, 39),
     'gants': [(7, 14, 31, 43), (84, 7, 105, 38)], 'culotte': (21, 68, 66, 92),
     'crosse': []},
]


def celebrations():
    sorties = []
    dans = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]  # noqa: E731
    for z in CELEBRATIONS:
        im = np.asarray(Image.open(SRC / f"{z['nom']}.{z.get('ext', 'jpg')}").convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000])
        # on ne bouche que les petits trous : le fond vu entre les bras et la crosse reste vide
        trous, n = ndimage.label(ndimage.binary_fill_holes(fg) & ~fg)
        tailles = ndimage.sum(trous > 0, trous, range(1, n + 1))
        fg |= np.isin(trous, [i + 1 for i, t in enumerate(tailles) if t < 400])
        a = quantifie([pixelise(im, fg, z.get('periode', PERIODE_GARDIEN))])[0]
        detoure_violet(a, s_min=0.15)  # le liseré rose sous les patins aussi
        H, W = a.shape[:2]
        magenta = np.zeros((H, W), bool)
        for y in range(H):
            for x in range(W):
                h, s, v = hsv(a[y, x, :3])
                magenta[y, x] = a[y, x, 3] > 0 and 285 <= h <= 320 and s > 0.6 and v > 0.5
        for y, x in zip(*np.where(magenta)):
            vois = [(yy, xx) for yy in range(max(0, y - 1), min(H, y + 2)) for xx in range(max(0, x - 1), min(W, x + 2))
                    if (yy, xx) != (y, x) and a[yy, xx, 3] and not magenta[yy, xx]]
            if len(vois) >= 5:
                # fond magenta coincé dans le patin : il prend la couleur la plus sombre autour
                a[y, x, :3] = min((a[p][:3] for p in vois), key=lambda c: int(c.sum()))
            else:
                a[y, x, 3] = 0  # fond magenta vu entre la chaussure et la lame
        roles = np.zeros((H, W), np.uint8)
        for y in range(H):
            for x in range(W):
                if not a[y, x, 3]:
                    continue
                h, s, v = hsv(a[y, x, :3])
                r = role_couleur(h, s, v, False)
                rouge = r == R['maillot']
                if r == R['contour']:
                    pass
                elif any(dist_seg(x, y, *seg[:4]) <= (seg[4] if len(seg) > 4 else z.get('rayon', 2.5)) for seg in z['crosse']) and (
                        r == R['bande'] or not any(dans(x, y, g) for g in z['gants'])):
                    r = R['garde']  # la crosse garde ses couleurs
                elif dans(x, y, z['casque']):
                    # vrai rouge seulement : la peau orangée du front (tête renversée) reste telle quelle
                    vrai_rouge = rouge and (h >= 330 or h <= 12)
                    r = R['casque'] if vrai_rouge else R['casque-bande'] if r == R['bande'] else R['garde']
                elif dans(x, y, z['visage']):
                    # visage (peau, barbe, bouche) tel quel ; le col du maillot garde son rôle
                    bas = y >= z['visage'][3] - 5  # le col est en bas du visage (la bouche, plus haut)
                    col = bas and ((rouge and s > 0.8 and v > 0.45) or (r == R['bande'] and h >= 35) or (r == R['blanc'] and s < 0.2))
                    if not col:
                        r = R['garde']
                elif any(dans(x, y, g) for g in z['gants']) and r != R['bande'] and (
                        (8 <= h <= 35 and v < 0.72) or (rouge and v < 0.55)):
                    r = R['gants']
                elif dans(x, y, z['culotte']):
                    if rouge and (v < 0.5 or 12 < h < 30):
                        r = R['garde']  # ombres de la culotte brune
                elif r == R['blanc'] and 160 <= h <= 230:
                    r = R['garde']  # lames des patins, gris bleuté
                elif r == R['garde'] and (h <= 26 or h >= 330) and s > 0.45:
                    r = R['maillot']  # ombres brun-rouge du maillot
                roles[y, x] = r
        nettoie(roles)
        sorties.append((a, roles))
    return sorties
