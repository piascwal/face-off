/**
 * Trois appareils sur le même Wi-Fi : un hôte, un invité et un spectateur qui
 * arrive en cours de match. Le spectateur suit le jeu, envoie des réactions
 * (relayées à tous, avec anti-matraquage), suit la revanche et attend pendant
 * le choix des équipes.
 */
import { attends, lan } from './outils.mjs';

export default async function spectateur(env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12' });
  const invite = await env.appareil('INVITE', { pseudo: 'BISON 15' });
  await lan.connecte(env, hote, invite);
  await lan.lanceMatch(env, hote, invite);

  // un 3e appareil ouvre la liste : la partie pleine y est « à regarder »
  const spect = await env.appareil('SPECT', { pseudo: 'OURS 22' });
  await spect.page.evaluate(() => window.faceOff.lan.ouvre());
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.lan.client?.parties.some((p) => p.plein)), 'la partie pleine est annoncée (REGARDER)');
  await env.capture(spect.page, '1-liste');
  await spect.page.evaluate(() => window.faceOff.lan.rejoins(window.faceOff.lan.client.parties.find((p) => p.plein), true));
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'jeu' && window.faceOff.lan.spectateur), 'le spectateur est pris en route dans le match');
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.nbSpectateurs === 1), 'l\'hôte compte 1 spectateur');
  env.verifie(await env.attendsQue(invite.page, () => window.faceOff.lan.client.partie.spect === 1), 'l\'invité voit 1 spectateur');
  await attends(1500);
  const tH = await hote.page.evaluate(() => window.faceOff.state.temps);
  const tS = await spect.page.evaluate(() => window.faceOff.state.temps);
  env.verifie(Math.abs(tH - tS) < 1, `le spectateur suit le match (horloges ${tH.toFixed(2)} / ${tS.toFixed(2)})`);

  // réactions : relayées à tous ; la 2e, trop rapprochée, est ignorée
  await spect.page.evaluate(() => window.faceOff.lan.reagit('logo1'));
  await spect.page.evaluate(() => window.faceOff.lan.reagit('feu'));
  await attends(450);
  await spect.page.evaluate(() => window.faceOff.lan.reagit('gyro'));
  await attends(300);
  const liste = (a) => a.page.evaluate(() => window.faceOff.lan.reactions.map((r) => `${r.r}:${r.de}`).join(','));
  const attendu = 'logo1:OURS 22,gyro:OURS 22';
  const [rH, rI, rS] = [await liste(hote), await liste(invite), await liste(spect)];
  env.verifie(rH === attendu && rI === attendu && rS === attendu, `réactions relayées à tous, anti-matraquage (${rH} | ${rI} | ${rS})`);
  await env.capture(spect.page, '2-spectateur');
  await env.capture(invite.page, '3-invite');

  // bonus en Wi-Fi : l'invité déclenche le sien (touche B), l'hôte l'applique, tout le monde le voit
  await hote.page.evaluate(() => {
    const pv = window.faceOff.state.pouvoirs[1];
    pv.pret = 'ricochet';
    pv.tirage = 0;
  });
  env.verifie(await env.attendsQue(invite.page, () => window.faceOff.state.pouvoirs?.[1].pret === 'ricochet'), 'l\'invité voit son bonus prêt');
  await invite.page.keyboard.press('KeyB');
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.state.pouvoirs[1].actif === 'ricochet'), 'touche B de l\'invité : bonus déclenché chez l\'hôte');
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.state.pouvoirs?.[1].actif === 'ricochet'), 'le spectateur voit le bonus en cours');
  await env.capture(invite.page, '3b-bonus-invite');

  // un joueur ne réagit pas pendant le match
  await invite.page.evaluate(() => window.faceOff.lan.client.reagit('coeur'));
  await attends(300);
  env.verifie(!(await hote.page.evaluate(() => window.faceOff.lan.reactions.some((r) => r.r === 'coeur'))), 'pas de réaction des joueurs pendant le match');

  // fin du match : le spectateur voit l'écran de fin, les joueurs peuvent réagir
  await lan.termineMatch(hote, [2, 1]);
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'fin'), 'le spectateur est sur l\'écran de fin');
  await attends(2500);
  await invite.page.evaluate(() => {
    const a = window.faceOff;
    a.imageFin.passe();
    a.lan.reagit('coeur');
  });
  await attends(300);
  env.verifie(await spect.page.evaluate(() => window.faceOff.lan.reactions.some((r) => r.r === 'coeur' && r.de === 'BISON 15')), 'réaction d\'un joueur à la fin, vue par le spectateur');
  await env.capture(spect.page, '4-fin-spectateur');

  // revanche : le spectateur suit
  await hote.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  await invite.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'jeu'), 'le spectateur suit la revanche');

  // retour au choix des équipes : le spectateur attend
  await lan.termineMatch(hote, [1, 0]);
  await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'fin');
  await hote.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'equipes' }));
  await invite.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'equipes' }));
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'lanSpect'), 'le spectateur attend pendant le choix des équipes');
  await env.capture(spect.page, '5-attente');

  // le spectateur s'en va (ÉCHAP : retour à la liste des parties, pas au menu)
  await spect.page.keyboard.press('Escape');
  await attends(300);
  env.verifie((await spect.page.evaluate(() => window.faceOff.ecranUI)) === 'lan', 'ÉCHAP : le spectateur revient à la liste des parties');
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.nbSpectateurs === 0), 'le départ du spectateur est pris en compte');
}
