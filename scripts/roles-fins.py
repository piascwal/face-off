#!/usr/bin/env python3
"""
Cartes de rôles des images de fin de match (public/fins/victoire.jpg et
defaite.jpg) : où sont les maillots rouges, leurs bandes dorées et leurs
empiècements crème, pour repeindre les joueurs aux couleurs de l'équipe du
joueur (voir src/render/fins.ts).

On ne garde que le rouge des grandes zones (les maillots) : les fines lignes
rouges de la glace, les montants de la cage ou les points rouges de la foule
restent tels quels ; l'or et le crème ne comptent que près d'un maillot (la
bande jaune de la bordure, les confettis ne bougent pas).

Sorties : public/fins/<image>-roles.png (0 rien, 85 maillot, 170 bande,
255 crème) et src/render/fins-reference.json (couleur de référence de chaque
rôle, assez claire, pour le repeint). À relancer seulement si les images changent :

    pip install numpy scipy pillow
    python3 scripts/roles-fins.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

RACINE = Path(__file__).resolve().parent.parent
FINS = RACINE / 'public' / 'fins'
IMAGES = ['victoire', 'defaite']


def hsv(a):
    a = a / 255.0
    mx, mn = a.max(2), a.min(2)
    d = mx - mn
    h = np.zeros_like(mx)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = d > 1e-6
    hr = (mx == r) & m
    hg = (mx == g) & m & ~hr
    hb = m & ~hr & ~hg
    h[hr] = ((g - b)[hr] / d[hr]) % 6
    h[hg] = (b - r)[hg] / d[hg] + 2
    h[hb] = (r - g)[hb] / d[hb] + 4
    return h * 60, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def disque(r):
    return np.hypot(*np.mgrid[-r:r + 1, -r:r + 1]) <= r


def roles(a):
    h, s, v = hsv(a.astype(float))
    # rouge du maillot, y compris ses ombres rosées sous l'éclairage magenta de
    # la victoire (sombres : les banderoles roses, claires, ne sont pas prises)
    rouge = (((h >= 340) | (h <= 8)) & (s > 0.55) & (v > 0.1)) | ((h >= 322) & (h < 340) & (s > 0.55) & (v > 0.1) & (v < 0.5))
    # les maillots : de grandes zones rouges (une ouverture efface les traits fins)
    blocs = ndimage.binary_opening(rouge, structure=disque(4))
    maillot = rouge & ndimage.binary_dilation(blocs, structure=disque(7))
    proche = ndimage.binary_dilation(blocs, structure=disque(10))
    bande = (h >= 30) & (h <= 52) & (s > 0.55) & (v > 0.55) & proche & ~maillot
    creme = (h >= 25) & (h <= 60) & (s < 0.25) & (s > 0.05) & (v > 0.78) & proche & ~maillot & ~bande
    return maillot, bande, creme


def main():
    refs = {}
    for nom in IMAGES:
        a = np.asarray(Image.open(FINS / f'{nom}.jpg').convert('RGB'))
        maillot, bande, creme = roles(a)
        carte = np.zeros(a.shape[:2], np.uint8)
        carte[maillot] = 85
        carte[bande] = 170
        carte[creme] = 255
        Image.fromarray(carte, 'L').save(FINS / f'{nom}-roles.png', optimize=True)
        # référence : une couleur du rôle assez claire (65e centile de luminosité),
        # pour que les maillots foncés ne ressortent pas délavés
        def ref(m):
            px = a[m].astype(float)
            l = px @ [0.3, 0.59, 0.11]
            return [int(x) for x in px[np.argsort(l)[int(len(l) * 0.65)]]]
        refs[nom] = {r: ref(m) for r, m in (('maillot', maillot), ('bande', bande), ('blanc', creme))}
        print(nom, {r: int(m.sum()) for r, m in (('maillot', maillot), ('bande', bande), ('blanc', creme))}, refs[nom])
    (RACINE / 'src' / 'render' / 'fins-reference.json').write_text(json.dumps(refs, indent=2) + '\n')


if __name__ == '__main__':
    main()
