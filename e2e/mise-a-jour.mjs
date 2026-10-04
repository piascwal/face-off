/**
 * Mise à jour proposée au menu : la fenêtre n'est jamais bloquante (« plus
 * tard »), laisse un rappel, et « mettre à jour » appelle bien l'installation.
 */
import { attends } from './outils.mjs';

export default async function (env) {
  const a = await env.appareil('joueur', { pseudo: 'MAJ' });
  const p = a.page;
  await p.evaluate(() => {
    window.faceOff.attenteDemarrage = false;
    window.__installations = 0;
    window.faceOff.maj.signale(() => window.__installations++, 'V9.9.9');
  });
  await attends(300);
  env.verifie(await p.evaluate(() => window.faceOff.maj.proposee), 'la mise à jour est proposée');
  env.verifie(
    (await p.evaluate(() => window.faceOff.boutons.length)) === 2,
    'la fenêtre prend tous les appuis : seulement ses deux boutons',
  );
  await env.capture(p, 'proposition');
  // « plus tard » : dernier bouton dessiné
  await p.evaluate(() => {
    const z = window.faceOff.boutons;
    z[z.length - 1].act();
  });
  env.verifie(await p.evaluate(() => window.faceOff.maj.refusee), '« plus tard » ferme la fenêtre');
  env.verifie((await p.evaluate(() => window.__installations)) === 0, 'rien n’est installé sans accord');
  await attends(300);
  env.verifie(
    (await p.evaluate(() => window.faceOff.boutons.length)) > 3,
    'le menu est de nouveau utilisable, avec le bouton de rappel',
  );
  await env.capture(p, 'rappel');
  await p.evaluate(() => window.faceOff.maj.rouvre());
  await attends(200);
  await p.evaluate(() => window.faceOff.boutons[0].act()); // METTRE A JOUR
  env.verifie(
    (await p.evaluate(() => window.__installations)) === 1,
    '« mettre à jour » lance l’installation',
  );
}
