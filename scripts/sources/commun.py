"""Outils communs de la conversion : détourage, grille du dessin, pixelisation, couleurs, rôles."""


import colorsys
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans

SRC = Path(__file__).resolve().parents[2] / 'assets' / 'sprites-src'

# Rôles d'un pixel ; l'indice est la valeur écrite dans les cartes *-roles.png.
ROLES = [
    'vide',
    'contour',  # trait sombre : neutralisé (le fond magenta y déteint)
    'maillot',  # couleur principale du chandail
    'bande',  # bandes et liserés dorés
    'blanc',  # empiècements clairs
    'casque',  # coque du casque / du masque
    'casque-bande',
    'gants',
    'garde',  # à garder tel quel (crosse, culotte, patins, grille du masque...)
    'peau',
    'barbe',
    'ecusson',  # emplacement de l'écusson sur la poitrine
]
R = {nom: i for i, nom in enumerate(ROLES)}

# Période de la grille du dessin (px d'image par pixel de dessin), mesurée
# avec `periode()` : la FFT hésite entre plusieurs pics voisins sur la
# planche (2,73 / 2,93) et donne un demi-pixel (2,93) pour le gardien, on fixe
# donc les valeurs retenues après vérification à l'œil.
PERIODE_PLANCHE = 2.93
PERIODE_GARDIEN = 5.86


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(c, float) / 255))
    return h * 360, s, v


def periode(img, masque):
    """Période de la grille du dessin (px), par FFT du gradient horizontal."""
    L = img.mean(2)
    s = (np.abs(np.diff(L, axis=1)) * masque[:, 1:]).sum(0)
    s = s - s.mean()
    F = np.abs(np.fft.rfft(s))
    f = np.fft.rfftfreq(len(s))
    ok = (f > 1 / 40) & (f < 1 / 2.2)
    return 1 / f[np.argmax(F * ok)]


def pixelise(img, masque, P):
    """Une couleur par case de la grille (médiane des pixels du dessin)."""
    L = img.mean(2)
    gx = (np.abs(np.diff(L, axis=1)) * masque[:, 1:]).sum(0)
    gy = (np.abs(np.diff(L, axis=0)) * masque[1:, :]).sum(1)

    def calage(s):
        ph = np.linspace(0, P, 40, endpoint=False)
        sc = [np.interp(np.arange(p, len(s) - 1, P), np.arange(len(s)), s).mean() for p in ph]
        return ph[int(np.argmax(sc))] + 0.5

    x0, y0 = calage(gx), calage(gy)
    nx, ny = int((img.shape[1] - x0) / P), int((img.shape[0] - y0) / P)
    out = np.zeros((ny, nx, 4))
    for j in range(ny):
        for i in range(nx):
            ya, xa = y0 + j * P, x0 + i * P
            sy = slice(int(round(ya)), max(int(round(ya)) + 1, int(round(ya + P))))
            sx = slice(int(round(xa)), max(int(round(xa)) + 1, int(round(xa + P))))
            bm = masque[sy, sx].reshape(-1)
            if bm.mean() < 0.5:
                continue
            out[j, i, :3] = np.median(img[sy, sx].reshape(-1, 3)[bm], 0)
            out[j, i, 3] = 255
    ys, xs = np.where(out[..., 3] > 0)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def quantifie(dessins, n=64):
    pts = np.concatenate([d[d[..., 3] > 0][:, :3] for d in dessins])
    km = KMeans(n, n_init=4, random_state=0).fit(pts)
    for d in dessins:
        m = d[..., 3] > 0
        d[m, :3] = km.cluster_centers_[km.predict(d[m, :3])]
    return [d.astype(np.uint8) for d in dessins]


# --- Rôles --------------------------------------------------------------------


def dist_seg(x, y, x0, y0, x1, y1):
    vx, vy = x1 - x0, y1 - y0
    t = min(1, max(0, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
    return np.hypot(x0 + t * vx - x, y0 + t * vy - y)


def haut(a):
    """Première ligne opaque et centre du casque (sur ses 5 premières lignes)."""
    top = int(np.where(a[..., 3].any(1))[0][0])
    xs = np.where(a[top:top + 5, :, 3].any(0))[0]
    return top, (xs.min() + xs.max()) / 2


def role_couleur(h, s, v, dans_casque):
    rouge = ((h >= 330 or h <= 12) and s > 0.45) or (12 < h < 26 and s > 0.5 and v > 0.45)
    dore = 26 <= h <= 50 and s > 0.55 and v > 0.5
    if v < 0.24 or (250 < h < 330 and s > 0.5 and v < 0.3):
        return R['contour']
    if dans_casque and (rouge or dore):
        return R['casque'] if rouge else R['casque-bande']
    if rouge:
        return R['maillot']
    if dore:
        return R['bande']
    if s < 0.3 and v > 0.42:
        return R['blanc']  # empiècements clairs et leurs ombres (grises ou violacées)
    return R['garde']


def zone_ecusson(a, lab, top, cx, y_min, y_max):
    """L'emblème bleu de la poitrine : sa boîte devient la zone de l'écusson."""
    H, W = lab.shape
    pts = []
    for y in range(max(0, top + y_min), min(H, top + y_max)):
        for x in range(W):
            if a[y, x, 3]:
                h, s, v = hsv(a[y, x, :3])
                if 190 <= h <= 235 and s > 0.35 and v > 0.25:
                    pts.append((x, y))
    if len(pts) < 6:
        return
    xs, ys = zip(*pts)
    x0, x1, y0, y1 = min(xs) - 1, max(xs) + 1, min(ys) - 1, max(ys) + 1
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if a[y, x, 3] and lab[y, x] != R['contour']:
                lab[y, x] = R['ecusson']
    # les ornements gris de l'emblème d'origine (haches) autour de la boîte
    for y in range(max(0, y0 - 4), min(H, y1 + 5)):
        for x in range(max(0, x0 - 5), min(W, x1 + 6)):
            if a[y, x, 3] and lab[y, x] not in (R['contour'], R['ecusson']):
                h, s, v = hsv(a[y, x, :3])
                if s < 0.25 and 0.35 < v < 0.9:
                    lab[y, x] = R['ecusson']


# Rôles qu'un pixel isolé peut échanger avec ses voisins (pas la peau, la barbe,
# l'écusson ni le contour, dessinés à part ou déjà précis).
ECHANGEABLES = ('maillot', 'bande', 'blanc', 'casque', 'casque-bande', 'gants', 'garde')


def nettoie(lab, passes=2):
    """
    Pixels isolés : un pixel dont presque aucun voisin ne partage le rôle prend
    celui qui domine autour de lui. Sans ça, quelques pixels d'ombre mal classés
    gardent la couleur d'origine (rouge, or) au milieu d'un maillot repeint.
    """
    ok = {R[n] for n in ECHANGEABLES}
    H, W = lab.shape
    for _ in range(passes):
        nouv = lab.copy()
        for y in range(H):
            for x in range(W):
                r = int(lab[y, x])
                if r not in ok:
                    continue
                vois = [int(lab[yy, xx]) for yy in range(max(0, y - 1), min(H, y + 2))
                        for xx in range(max(0, x - 1), min(W, x + 2)) if (yy, xx) != (y, x)]
                if sum(v == r for v in vois) > 1:
                    continue
                autres = [v for v in vois if v in ok and v != r]
                if autres:
                    q = max(set(autres), key=autres.count)
                    if autres.count(q) >= 4:
                        nouv[y, x] = q
        lab[:] = nouv


def detoure_violet(a, s_min=0.3):
    """Le halo violet du fond, accroché au bord du dessin (les contours sombres restent)."""
    H, W = a.shape[:2]
    hv = np.array([[hsv(a[y, x, :3]) for x in range(W)] for y in range(H)])
    violet = (hv[..., 0] > 255) & (hv[..., 0] < 335) & (hv[..., 1] > s_min) & (hv[..., 2] > 0.28)
    while True:
        vide = np.pad(a[..., 3] == 0, 1, constant_values=True)
        bord = ndimage.binary_dilation(vide)[1:-1, 1:-1] & (a[..., 3] > 0) & violet
        if not bord.any():
            return
        a[bord, 3] = 0
