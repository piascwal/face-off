import type { AppLan } from '@piascwal/lan-kit';

/**
 * Version du protocole : à incrémenter à CHAQUE modification incompatible des
 * messages. Elle sert aussi de nom de salon : un appareil d'une autre version ne
 * voit simplement pas la partie. Le socle réseau (découverte, chiffrement,
 * liaison WebRTC, salons en ligne) vient de lan-kit.
 */
export const VERSION_PROTOCOLE = 24;

/** Identité de Face-Off sur le réseau (voir lan-kit). */
export const APP: AppLan = { id: 'face-off', version: VERSION_PROTOCOLE };

export { idAleatoire } from '@piascwal/lan-kit';
