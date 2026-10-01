/**
 * Bonus en solo : jauge affichée, tirage, bouton BONUS au doigt et touche B,
 * joueur doré, « 2X » au-dessus de la cage, freeze, inversion, tir
 * surpuissant, et option du menu qui coupe tout.
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
  env.verifie(j0 && j0.seuil === 4 && j0.passes === 0, 'jauge des bonus : 0 / 4 passes');
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
  env.verifie(j1.seuil === 4, 'prochain bonus : toujours 4 passes');
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

  // freeze : tout le monde est pris dans la glace, sauf le joueur doré
  const donne = (id) =>
    p.evaluate((i) => {
      const pv = window.faceOff.state.pouvoirs[0];
      pv.actif = null;
      pv.pret = i;
      pv.tirage = 0;
    }, id);
  await donne('freeze');
  await touche('KeyB');
  env.verifie((await pv(0)).actif === 'freeze', 'touche B : FREEZE en cours');
  const xs = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.eq === 1).map((s) => s.x));
  await attends(400);
  await env.capture(p, '6-freeze');
  const xs2 = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.eq === 1).map((s) => s.x));
  env.verifie(xs.every((x, i) => Math.abs(x - xs2[i]) < 0.01), 'les adversaires ne bougent plus');

  // inversion : spirales au-dessus des adversaires
  await donne('inversion');
  await touche('KeyB');
  env.verifie((await pv(0)).actif === 'inversion', 'touche B : INVERSION en cours');
  await attends(500);
  await env.capture(p, '7-inversion');

  // tir surpuissant au clavier : B maintenue charge le tir, relâchée le déclenche
  const donnePalet = () =>
    p.evaluate(() => {
      const st = window.faceOff.state;
      const s = st.controles[0];
      if (st.palet.porteur) st.palet.porteur.tient = false;
      st.palet.porteur = s;
      st.palet.dernier = s;
      s.tient = true;
      s.recupCd = 0;
      // les adversaires loin, à l'autre bout : personne ne vient voler le palet pendant le test
      for (const o of st.patineurs) {
        if (o.eq !== 1) continue;
        o.x = s.x + 150;
        o.y = s.y + 60;
        o.vx = o.vy = 0;
      }
    });
  await donne('puissant');
  await donnePalet();
  await attends(100);
  await p.keyboard.down('KeyB');
  await attends(350);
  const charge = await p.evaluate(() => {
    const st = window.faceOff.state;
    return { actif: st.pouvoirs[0].actif, arme: st.controles[0].arme };
  });
  env.verifie(charge.actif === 'puissant' && charge.arme, 'B maintenue : bonus déclenché et tir en charge');
  await p.keyboard.up('KeyB');
  await attends(40);
  // le bonus n'est consommé que par un tir (sa fenêtre dure 10 s) : actif à null = le tir est parti avec
  const parti = await p.evaluate(() => ({ actif: window.faceOff.state.pouvoirs[0].actif, tient: window.faceOff.state.controles[0].tient }));
  env.verifie(parti.actif === null && !parti.tient, 'B relâchée : tir surpuissant parti');
  await env.capture(p, '8-surpuissant');

  // tir guidé au doigt : appui sur BONUS, glissé pour viser, relâché pour tirer
  await donne('guide');
  await donnePalet();
  await attends(150);
  const doigt = await p.evaluate(() => {
    const app = window.faceOff;
    const k = window.innerWidth / app.W;
    return { x: (app.W - 72) * k, y: (app.H - 62) * k };
  });
  const pointeur = (type, x, y) =>
    p.evaluate(
      ([t, px, py]) => {
        const c = document.querySelector('canvas');
        c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: px, clientY: py, bubbles: true, isPrimary: true }));
      },
      [type, x, y],
    );
  await pointeur('pointerdown', doigt.x, doigt.y);
  await attends(150);
  await pointeur('pointermove', doigt.x + 60, doigt.y - 30);
  await attends(250);
  const vise = await p.evaluate(() => {
    const st = window.faceOff.state;
    return { actif: st.pouvoirs[0].actif, arme: st.controles[0].arme, ui: window.faceOff.entrees.instantaneUI() };
  });
  env.verifie(vise.actif === 'guide' && vise.arme && vise.ui.tirBonus, 'doigt sur BONUS : tir guidé déclenché, tir en charge');
  await env.capture(p, '8b-guide-visee');
  await pointeur('pointerup', doigt.x + 60, doigt.y - 30);
  await attends(40);
  const guide = await p.evaluate(() => ({ actif: window.faceOff.state.pouvoirs[0].actif, tient: window.faceOff.state.controles[0].tient }));
  env.verifie(guide.actif === null && !guide.tient, 'doigt relevé : tir guidé parti');

  // option du menu : sans bonus, pas de jauge
  await p.evaluate(() => {
    window.faceOff.pref.bonus = false;
    window.faceOff.solo.rejoue();
  });
  await attends(300);
  env.verifie((await pv(0)) === null, 'option BONUS NON : aucun bonus en match');
  await env.capture(p, '9-sans-bonus');
}
