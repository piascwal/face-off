/**
 * Coupures Wi-Fi en pleine partie (point 1 des évolutions du multijoueur) :
 * 1. liaison coupée net pendant le match, avec un spectateur : l'hôte garde
 *    la place, tout le monde voit le compte à rebours, l'invité revient seul
 *    et le match reprend au même score ;
 * 2. liaison muette (Wi-Fi qui décroche sans prévenir) : détection par le
 *    silence, puis même retour ;
 * 3. l'invité ne revient pas : au bout du délai, l'hôte retrouve la salle
 *    d'attente avec un message.
 * Délai de reconnexion raccourci à 15 s pour le test (paramètre de dev).
 */
import { attends, lan } from './outils.mjs';

const PARAMS = 'reconnexion=15';

export default async function reconnexion(env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12', parametres: PARAMS });
  const invite = await env.appareil('INVITE', { pseudo: 'BISON 15', parametres: PARAMS });
  await lan.connecte(env, hote, invite);
  await lan.lanceMatch(env, hote, invite);
  const spect = await env.appareil('SPECT', { pseudo: 'OURS 22', parametres: PARAMS });
  await spect.page.evaluate(() => window.faceOff.lan.ouvre());
  await env.attendsQue(spect.page, () => window.faceOff.lan.client?.parties.some((p) => p.enCours));
  await spect.page.evaluate(() => window.faceOff.lan.rejoins(window.faceOff.lan.client.parties.find((p) => p.enCours), true));
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'jeu' && window.faceOff.lan.spectateur), 'un spectateur regarde le match');

  // on attend la fin du « PRÊTS ? », puis le score passe à 2-1
  await attends(2500);
  await hote.page.evaluate(() => (window.faceOff.state.score = [2, 1]));
  await attends(500);

  // ------------------------------------------------ 1. coupure franche
  console.log('  — coupure franche');
  await invite.page.evaluate(() => window.faceOff.lan.client.liaison.ferme());
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence > 0, null, 8000), 'l\'hôte garde la place de l\'invité');
  const fige = await hote.page.evaluate(() => {
    const e = window.faceOff.lan.hote.partie;
    return e.pause === 2 && !!e.sieges[2];
  });
  env.verifie(fige, 'le match est figé, l\'invité reste inscrit');
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.lan.client.partie.absent > 0), 'le spectateur voit l\'attente');
  const t0 = await hote.page.evaluate(() => window.faceOff.state.temps);
  await env.capture(hote.page, '1-hote-attente');
  await env.capture(spect.page, '2-spectateur-attente');
  if (await env.attendsQue(invite.page, () => !!window.faceOff.lan.client?.reconnexion, null, 3000)) await env.capture(invite.page, '3-invite-reconnexion');
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence === 0 && !!window.faceOff.lan.hote.partie.sieges[2], null, 14000), 'l\'invité revient tout seul');
  env.verifie(await env.attendsQue(invite.page, () => window.faceOff.ecranUI === 'jeu' && !window.faceOff.lan.client.reconnexion), 'l\'invité retrouve le match');
  const t1 = await hote.page.evaluate(() => window.faceOff.state.temps);
  env.verifie(Math.abs(t1 - t0) < 0.05, `le temps de jeu n'a pas avancé pendant la coupure (${t0.toFixed(2)} / ${t1.toFixed(2)})`);
  env.verifie(await env.attendsQue(invite.page, () => String(window.faceOff.state.score) === '2,1'), 'l\'invité retrouve le score (2-1)');
  await env.capture(invite.page, '4-invite-reprise');
  // compte à rebours de 3 s, puis le jeu repart
  env.verifie(await env.attendsQue(hote.page, (t) => window.faceOff.state.temps > t + 0.5, t1, 8000), 'le match reprend après le compte à rebours');
  const synchro = await env.attendsQue(invite.page, (t) => window.faceOff.state.temps > t + 0.5, t1, 3000);
  env.verifie(synchro, 'l\'invité suit de nouveau le match');
  env.verifie(await spect.page.evaluate(() => window.faceOff.lan.client.partie.absent === 0 && window.faceOff.ecranUI === 'jeu'), 'le spectateur voit la reprise');

  // les commandes de l'invité arrivent de nouveau à l'hôte
  await invite.page.keyboard.down('ArrowRight');
  await attends(600);
  const entree = await hote.page.evaluate(() => window.faceOff.lan.hote.entreeSiege(2, performance.now() / 1000).ix);
  await invite.page.keyboard.up('ArrowRight');
  env.verifie(entree !== 0, 'les commandes de l\'invité reviennent à l\'hôte');

  // ------------------------------------------------ 2. liaison muette
  console.log('  — Wi-Fi qui décroche sans prévenir');
  await invite.page.evaluate(() => {
    const l = window.faceOff.lan.client.liaison;
    l.envoieCtrl = () => {};
    l.envoieJeu = () => {};
    l.onCtrl = () => {};
    l.onJeu = () => {};
  });
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence > 0, null, 12000), 'l\'hôte détecte le silence et garde la place');
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence === 0 && !!window.faceOff.lan.hote.partie.sieges[2], null, 16000), 'l\'invité revient après la coupure silencieuse');
  env.verifie(await env.attendsQue(invite.page, () => window.faceOff.ecranUI === 'jeu' && !window.faceOff.lan.client.reconnexion), 'l\'invité est de nouveau dans le match');

  // ------------------------------------------------ 3. l'invité ne revient pas
  console.log('  — l\'invité ne revient pas');
  await invite.contexte.close();
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence > 0, null, 12000), 'appareil de l\'invité fermé : place gardée');
  env.verifie(
    await env.attendsQue(hote.page, () => window.faceOff.ecranUI === 'salon' && !window.faceOff.lan.hote.partie.sieges[2], null, 20000),
    'délai écoulé : l\'hôte revient en salle d\'attente',
  );
  const msg = await hote.page.evaluate(() => window.faceOff.lan.salonMessage?.txt ?? '');
  env.verifie(msg.includes('BISON 15'), `message à l'hôte (« ${msg} »)`);
  env.verifie(await env.attendsQue(spect.page, () => window.faceOff.ecranUI === 'salon'), 'le spectateur retrouve la salle d\'attente (il peut y prendre un siège)');
  await env.capture(hote.page, '5-hote-salon');

  // ------------------------------------------------ 4. coupure pendant le choix des équipes
  console.log('  — coupure pendant le choix des équipes');
  const invite2 = await env.appareil('INVITE2', { pseudo: 'PUMA 33', parametres: PARAMS });
  await lan.rejoint(env, invite2);
  await lan.prendSiege(env, invite2, 2);
  await hote.page.evaluate(() => window.faceOff.lan.agit({ a: 'lancer' }));
  env.verifie(await env.attendsQue(invite2.page, () => window.faceOff.ecranUI === 'lanChoix'), 'nouvel invité : choix des équipes');
  await invite2.contexte.close();
  env.verifie(await env.attendsQue(hote.page, () => window.faceOff.lan.hote.absence > 0, null, 12000), 'hors match aussi, la place est gardée');
  env.verifie(
    await env.attendsQue(hote.page, () => window.faceOff.ecranUI === 'salon' && !window.faceOff.lan.hote.partie.sieges[2], null, 20000),
    'hors match, le délai s\'écoule aussi : retour en salle d\'attente',
  );
}
