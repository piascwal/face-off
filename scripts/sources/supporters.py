"""Supporters (bonus « envahissement »)."""
from sources.commun import *  # noqa: F401,F403


# --- Supporters (bonus « envahissement ») ------------------------------------------

# Toutes les images du dossier supporters/ (fond magenta), dans l'ordre des noms :
# pour en ajouter un, il suffit de déposer son image. Les rôles se calculent
# seuls, par couleur : le rouge vif devient la couleur principale de l'équipe
# qui lance le bonus, le jaune et l'or sa couleur secondaire ; peau, cheveux,
# jean et le reste gardent leurs couleurs. Si un détail rouge ou jaune ne doit
# pas changer (des cheveux roux...), un fichier <nom>.json à côté de l'image
# liste ces zones : {"garde": [[x0, y0, x1, y1], ...]} (pixels du dessin recadré).
DOSSIER_SUPPORTERS = SRC / 'supporters'


def roles_supporter(a, gardees=()):
    H, W = a.shape[:2]
    roles = np.zeros((H, W), np.uint8)
    for y in range(H):
        for x in range(W):
            if not a[y, x, 3]:
                continue
            h, s, v = hsv(a[y, x, :3])
            if v < 0.24:
                r = R['contour']
            elif any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in gardees):
                r = R['garde']
            elif (h >= 295 or h <= 12) and s > 0.45:
                r = R['maillot']  # rouge, et ses ombres bordeaux
            elif 26 <= h <= 58 and s > 0.55 and v > 0.5:
                r = R['bande']  # jaune et or (main géante, rayures, écharpe)
            else:
                r = R['garde']
            roles[y, x] = r
    # petites taches isolées (lèvres, reflets dans les cheveux) : elles gardent leur couleur
    for role in (R['maillot'], R['bande']):
        lab, n = ndimage.label(roles == role)
        tailles = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        for i, t in enumerate(tailles):
            if t < 14:
                roles[lab == i + 1] = R['garde']
    nettoie(roles)
    return roles


def supporters():
    """Les supporters pixelisés (même grille que les joueurs) et leurs cartes de rôles."""
    sources = sorted(p for p in DOSSIER_SUPPORTERS.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))
    dessins = []
    for chemin in sources:
        im = np.asarray(Image.open(chemin).convert('RGB')).astype(float)
        fond = np.median(im[:30, :30].reshape(-1, 3), 0)
        fg = ndimage.binary_opening(np.linalg.norm(im - fond, axis=2) > 70, iterations=1)
        lab, n = ndimage.label(fg)
        tailles = ndimage.sum(fg, lab, range(1, n + 1))
        masque = ndimage.binary_fill_holes(np.isin(lab, [i + 1 for i, t in enumerate(tailles) if t > 1000]))
        P = periode(im, masque)
        dessins.append(pixelise(im, masque, P if 5 < P < 7 else PERIODE_GARDIEN))
    dessins = quantifie(dessins)
    sorties = []
    for chemin, a in zip(sources, dessins):
        for y in range(a.shape[0]):
            for x in range(a.shape[1]):
                if a[y, x, 3]:
                    h, s_, v = hsv(a[y, x, :3])
                    if 280 <= h <= 340 and s_ > 0.4 and v > 0.4:
                        a[y, x, 3] = 0  # le fond magenta, aussi dans les trous fermés
        detoure_violet(a)
        ys, xs = np.where(a[..., 3] > 0)
        a = np.ascontiguousarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        zones = chemin.with_suffix('.json')
        gardees = json.loads(zones.read_text())['garde'] if zones.exists() else ()
        sorties.append((a, roles_supporter(a, gardees)))
    return sorties
