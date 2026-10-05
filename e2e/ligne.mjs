/**
 * Jeu en ligne par code de salon, à deux « téléphones » : choix du mode, création
 * du salon (son code), entrée par ce code (un mauvais code ne trouve rien), pings
 * des joueurs, match, et changement de pseudo par le champ de saisie.
 */
import { attends, lan } from './outils.mjs';

export default async function (env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12' });
  const invite = await env.appareil('INVITE', { pseudo: 'BISON 15' });
  const intrus = await env.appareil('INTRUS', { pseudo: 'INTRUS' });
  const H = hote.page;
  const I = invite.page;

  // --- l'écran de choix, l'accueil, puis la création du salon
  await H.evaluate(() => window.faceOff.lan.ligne.ouvreChoix());
  await attends(200);
  await env.capture(H, 'choix');
  await H.evaluate(() => window.faceOff.lan.ligne.accueil());
  await attends(200);
  await env.capture(H, 'accueil');
  await H.evaluate(() => {
    window.faceOff.lan.ligne.cree();
    window.faceOff.lan.creePartie();
  });
  env.verifie(await env.attendsQue(H, () => !!window.faceOff.lan.hote), "l'hôte crée un salon en ligne");
  const code = await H.evaluate(() => window.faceOff.lan.canal.code);
  env.verifie(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code), `le salon a un code lisible (${code})`);

  // --- un mauvais code ne trouve aucun salon
  await intrus.page.evaluate(() => window.faceOff.lan.ligne.rejoint('ABCD-EFGH'));
  env.verifie(
    await env.attendsQue(intrus.page, () => window.faceOff.lan.statut === 'pret' && !!window.faceOff.lan.message, undefined, 15000),
    'un mauvais code ne trouve aucun salon',
  );
  await env.capture(intrus.page, 'mauvais-code');

  // --- le bon code
  await I.evaluate((c) => window.faceOff.lan.ligne.rejoint(c), code);
  env.verifie(await env.attendsQue(I, () => !!window.faceOff.lan.client?.partie, undefined, 20000), "l'invité entre dans le salon avec le code");
  await lan.prendSiege(env, invite, 2);
  env.verifie(await env.attendsQue(H, () => window.faceOff.lan.hote.partie.sieges[2] !== null), "l'hôte voit l'invité assis");

  // --- les pings
  env.verifie(await env.attendsQue(H, () => window.faceOff.lan.hote.pings[2] !== null, undefined, 8000), "l'hôte mesure le ping de l'invité");
  env.verifie(await env.attendsQue(I, () => window.faceOff.lan.client.pings[2] !== null, undefined, 8000), "l'invité reçoit son ping vu par l'hôte");
  await env.capture(H, 'salon-hote');
  await env.capture(I, 'salon-invite');

  // --- le match
  await lan.lanceMatch(env, hote, invite);
  env.verifie(await env.attendsQue(H, () => window.faceOff.ecranUI === 'jeu'), "l'hôte est en match");
  await attends(1500);
  await env.capture(H, 'match-hote');
  await env.capture(I, 'match-invite');

  // --- le pseudo, par le champ de saisie
  await intrus.page.evaluate(() => {
    window.faceOff.ecranUI = 'avance';
  });
  await attends(300);
  await intrus.page.evaluate(() => window.faceOff.boutons[0].act());
  env.verifie(await env.attendsQue(intrus.page, () => !!document.querySelector('input')), 'le champ de saisie du pseudo s’ouvre');
  await env.capture(intrus.page, 'saisie-pseudo');
  await intrus.page.fill('input', 'élodie_99 !');
  await intrus.page.press('input', 'Enter');
  env.verifie((await intrus.page.evaluate(() => window.faceOff.pref.pseudo)) === 'ELODIE99', 'le pseudo est nettoyé et gardé');
}
