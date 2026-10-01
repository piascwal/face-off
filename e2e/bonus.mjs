/**
 * Bonus en solo : jauge affichée, tirage, bouton BONUS au doigt et touche B,
 * joueur doré, « 2X » au-dessus de la cage, et option du menu qui coupe tout.
 */
import { attends } from './outils.mjs';

export default async function bonus(env) {
  const a = await env.appareil('BONUS', { stockage: { mode: 'classique', niveau: 1, duree: 1, equipeJoueur: 'nice', bonus: true } });
  const p = a.page;
  const touche = async (t) => {
    await p.keyboard.press(t);
    await attends(150);
  };
  await touche('Escape');
  await touche('Enter');
  await touche('Enter');
  await touche('Enter');
  env.verifie((await p.evaluate(() => window.faceOff.ecranUI)) === 'jeu', 'match lancé');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'jeu'), 'engagement joué');
  const pv = (eq) => p.evaluate((e) => window.faceOff.state.pouvoirs?.[e] ?? null, eq);
  const j0 = await pv(0);
  env.verifie(j0 && j0.seuil === 3 && j0.passes === 0, 'jauge des bonus : 0 / 3 passes');
  await p.evaluate(() => (window.faceOff.state.pouvoirs[0].passes = 2));
  await attends(200);
  await env.capture(p, '1-jauge');

  // tirage (comme après la 3e passe) : la roue tourne, puis le bonus est prêt
  await p.evaluate(() => {
    const pv = window.faceOff.state.pouvoirs[0];
    pv.passes = 0;
    pv.pret = 'vitesse';
    pv.tirage = 1.2;
  });
  await attends(450);
  await env.capture(p, '2-tirage');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.pouvoirs[0].tirage === 0, undefined, 3000), 'tirage terminé');
  await attends(150);
  env.verifie(await p.evaluate(() => window.faceOff.entrees.bonusVisible), 'bouton BONUS affiché');
  await env.capture(p, '3-pret');

  // touche B : le bonus part, le joueur piloté devient doré
  await touche('KeyB');
  const j1 = await pv(0);
  env.verifie(j1.actif === 'vitesse' && j1.pret === null, 'touche B : SUPER VITESSE en cours');
  env.verifie(j1.seuil === 4, 'prochain bonus : 4 passes');
  await attends(300);
  await env.capture(p, '4-dore');

  // bouton BONUS au doigt : but x2
  await p.evaluate(() => {
    const pv = window.faceOff.state.pouvoirs[0];
    pv.actif = null;
    pv.pret = 'double';
    pv.tirage = 0;
  });
  await attends(200);
  const { x, y } = await p.evaluate(() => {
    const app = window.faceOff;
    const k = window.innerWidth / app.W;
    return { x: (app.W - 72) * k, y: (app.H - 62) * k };
  });
  await p.touchscreen.tap(x, y);
  await attends(200);
  env.verifie((await pv(0)).actif === 'double', 'bouton BONUS : but x2 en cours');
  await env.capture(p, '5-double');

  // option du menu : sans bonus, pas de jauge
  await p.evaluate(() => {
    window.faceOff.pref.bonus = false;
    window.faceOff.solo.rejoue();
  });
  await attends(300);
  env.verifie((await pv(0)) === null, 'option BONUS NON : aucun bonus en match');
  await env.capture(p, '6-sans-bonus');
}
