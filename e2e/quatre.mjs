/**
 * Quatre joueurs et trois spectateurs sur le même Wi-Fi, en 2 contre 2 :
 * chacun choisit son rôle en arrivant (jouer sur un siège libre, ou regarder),
 * l'hôte règle équipes et maillots et lance, chaque joueur pilote son propre
 * patineur (entrées routées par siège), tous votent pour la revanche, et un
 * joueur qui part ramène tout le monde en salle d'attente.
 */
import { attends, lan } from './outils.mjs';

export default async function quatre(env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12', stockage: { formatWifi: '2v2', bonus: false, effectif: 1 } });
  const joueurs = [
    { app: await env.appareil('J2', { pseudo: 'ORQUE 7' }), siege: 1 },
    { app: await env.appareil('J3', { pseudo: 'FAUCON' }), siege: 2 },
    { app: await env.appareil('J4', { pseudo: 'LOUP' }), siege: 3 },
  ];
  const spects = [await env.appareil('S1', { pseudo: 'SARA' }), await env.appareil('S2', { pseudo: 'PAUL' }), await env.appareil('S3', { pseudo: 'NINA' })];
  const H = hote.page;

  env.verifie(await lan.ouvrePartie(env, hote), 'l\'hôte crée une partie');
  env.verifie((await H.evaluate(() => window.faceOff.lan.partie.config.format)) === '2v2', 'le format 2 contre 2 vient des réglages de l\'hôte');
  env.verifie((await H.evaluate(() => window.faceOff.lan.siege)) === 0, 'l\'hôte est assis d\'office au premier siège');

  // ---- arrivée : personne n'a de siège par défaut, chacun choisit
  const [j2, j3, j4] = joueurs.map((j) => j.app);
  await lan.rejoint(env, j2);
  env.verifie(await env.attendsQue(j2.page, () => window.faceOff.lan.client.role?.t === 'indecis' && window.faceOff.ecranUI === 'lanRole'), 'à l\'arrivée, écran JOUER / REGARDER (aucun siège par défaut)');
  await env.capture(j2.page, '1-choix-role');
  env.verifie((await H.evaluate(() => window.faceOff.lan.partie.indecis.length)) === 1, 'l\'hôte voit un arrivant qui n\'a pas encore choisi');
  await j2.page.evaluate(() => window.faceOff.lan.veutJouer());
  env.verifie(await env.attendsQue(j2.page, () => window.faceOff.ecranUI === 'salon'), 'JOUER mène à la salle d\'attente pour choisir un siège');
  await lan.prendSiege(env, j2, 1);

  for (const j of joueurs.slice(1)) {
    await lan.rejoint(env, j.app);
    await j.app.page.evaluate(() => window.faceOff.lan.veutJouer());
    await lan.prendSiege(env, j.app, j.siege);
  }
  env.verifie(await H.evaluate(() => window.faceOff.lan.partie.sieges.every((s) => !!s)), 'les quatre sièges sont pris, chez l\'hôte');
  env.verifie(await env.attendsQue(j4.page, () => window.faceOff.lan.partie?.sieges.every((s) => !!s)), 'et chez un joueur');

  // un siège pris ne peut pas être volé : le premier spectateur, lui, choisit de regarder
  for (const s of spects) await lan.rejoint(env, s);
  await spects[0].page.evaluate(() => window.faceOff.lan.prendSiege(2));
  await attends(400);
  env.verifie((await spects[0].page.evaluate(() => window.faceOff.lan.client.role?.t)) === 'indecis', 'un siège déjà pris est refusé');
  for (const s of spects) await s.page.evaluate(() => window.faceOff.lan.regarde());
  env.verifie(await env.attendsQue(H, () => window.faceOff.lan.partie.spectateurs.length === 3), 'l\'hôte compte 3 spectateurs');
  env.verifie(await env.attendsQue(spects[2].page, () => window.faceOff.lan.client.role?.t === 'spect' && window.faceOff.ecranUI === 'salon'), 'un spectateur reste dans la salle d\'attente');
  await attends(500);
  await env.capture(H, '2-salon-hote');
  await env.capture(j3.page, '3-salon-joueur');
  await env.capture(spects[1].page, '4-salon-spectateur');

  // ---- les joueurs règlent leur siège ; les spectateurs voient tout
  env.verifie(await env.attendsQue(spects[0].page, () => window.faceOff.lan.partie.sieges.every((s) => !!s)), 'le spectateur voit les quatre joueurs');
  env.verifie(
    (await H.evaluate(() => window.faceOff.lan.hote.partie.indecis.length)) === 0 && (await H.evaluate(() => window.faceOff.lan.partie.spectateurs.length)) === 3,
    'plus personne d\'indécis',
  );

  // ---- l'hôte lance : lui seul règle les équipes (des deux camps) et valide
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'lancer' }));
  env.verifie(await env.attendsQue(j4.page, () => window.faceOff.ecranUI === 'lanChoix'), 'les joueurs passent au choix des équipes');
  env.verifie(await env.attendsQue(spects[0].page, () => window.faceOff.ecranUI === 'lanSpect'), 'les spectateurs attendent pendant ce temps');
  await j3.page.evaluate(() => window.faceOff.lan.agit({ a: 'equipe', equipe: 'rouen' }));
  await j3.page.evaluate(() => window.faceOff.lan.agit({ a: 'pret', pret: true }));
  await attends(400);
  env.verifie((await H.evaluate(() => window.faceOff.lan.partie.camps.map((c) => c.equipe).join())) !== 'rouen,rouen', 'un joueur ne règle pas les équipes à la place de l\'hôte');
  env.verifie((await H.evaluate(() => window.faceOff.lan.partie.phase)) === 'equipes', 'et son « prêt » ne fait pas avancer la partie');
  await H.evaluate(() => {
    window.faceOff.lan.agit({ a: 'equipe', equipe: 'toulouse' });
    window.faceOff.lan.agit({ a: 'equipe', equipe: 'nice', camp: 1 });
  });
  await env.attendsQue(j4.page, () => window.faceOff.lan.partie.camps[1].equipe === 'nice');
  await env.capture(j4.page, '5-choix-equipes-joueur');
  for (let etape = 0; etape < 2; etape++) {
    await H.evaluate(() => window.faceOff.lan.agit({ a: 'pret', pret: true }));
    await attends(600);
  }
  for (const p of [H, ...joueurs.map((j) => j.app.page)]) {
    env.verifie(await env.attendsQue(p, () => window.faceOff.ecranUI === 'jeu'), 'le match démarre');
  }
  env.verifie(await env.attendsQue(spects[0].page, () => window.faceOff.ecranUI === 'jeu' && window.faceOff.lan.spectateur), 'les spectateurs suivent le match');

  // ---- quatre humains, un patineur chacun
  const compo = await H.evaluate(() => {
    const st = window.faceOff.state;
    return {
      humains: st.humains,
      duo: st.duo,
      distincts: new Set([st.controles[0], st.partenaires[0], st.controles[1], st.partenaires[1]]).size === 4,
      equipes: [st.controles[0]?.eq, st.partenaires[0]?.eq, st.controles[1]?.eq, st.partenaires[1]?.eq],
      nbHumains: st.patineurs.filter((s) => s.humain).length,
    };
  });
  env.verifie(compo.humains.every(Boolean) && compo.duo.every(Boolean), 'deux équipes à deux humains');
  env.verifie(compo.distincts && compo.nbHumains === 4 && compo.equipes.join() === '0,0,1,1', 'quatre patineurs humains distincts, deux par équipe');
  for (const j of joueurs) {
    const mien = await env.attendsQue(
      j.app.page,
      (s) => {
        const st = window.faceOff.state;
        const p = window.faceOff.lan.pilote(st);
        return !!p && p === (s === 1 ? st.partenaires[0] : s === 2 ? st.controles[1] : st.partenaires[1]);
      },
      j.siege,
      3000,
    );
    env.verifie(mien, `le joueur du siège ${j.siege} pilote le bon patineur`);
  }
  env.verifie(await H.evaluate(() => window.faceOff.lan.pilote(window.faceOff.state) === window.faceOff.state.controles[0]), 'l\'hôte pilote le premier patineur de son équipe');
  await env.capture(j3.page, '6-match-joueur');
  await env.capture(spects[0].page, '7-match-spectateur');

  // ---- les entrées arrivent chacune au bon patineur
  await H.evaluate(() => {
    window.faceOff.state.changementAuto = false;
  });
  await joueurs[0].app.page.keyboard.down('ArrowRight');
  await joueurs[1].app.page.keyboard.down('ArrowLeft');
  await joueurs[2].app.page.keyboard.down('ArrowUp');
  await attends(700);
  const ex = await H.evaluate(() => {
    const st = window.faceOff.state;
    return { a2: st.partenaires[0].ex, b1: st.controles[1].ex, b2: st.partenaires[1].ey, hote: st.controles[0].ex };
  });
  await joueurs[0].app.page.keyboard.up('ArrowRight');
  await joueurs[1].app.page.keyboard.up('ArrowLeft');
  await joueurs[2].app.page.keyboard.up('ArrowUp');
  env.verifie(ex.a2 > 0.5, `l'entrée du joueur A2 (→) va à son patineur (ex ${ex.a2.toFixed(2)})`);
  env.verifie(ex.b1 < -0.5, `l'entrée du joueur B1 (←) va à son patineur (ex ${ex.b1.toFixed(2)})`);
  env.verifie(ex.b2 < -0.5, `l'entrée du joueur B2 (↑) va à son patineur (iy ${ex.b2.toFixed(2)})`);
  env.verifie(Math.abs(ex.hote) < 0.2, 'l\'hôte, qui ne touche à rien, ne bouge pas');

  // ---- fin du match : tous votent, la revanche n'a lieu qu'à l'unanimité
  await lan.termineMatch(hote, [2, 1]);
  for (const p of [H, ...joueurs.map((j) => j.app.page)]) env.verifie(await env.attendsQue(p, () => window.faceOff.ecranUI === 'fin', undefined, 12000), 'écran de fin');
  env.verifie(await env.attendsQue(spects[0].page, () => window.faceOff.ecranUI === 'fin'), 'les spectateurs voient la fin');
  await env.capture(j3.page, '8-fin-joueur');
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  for (const j of joueurs.slice(0, 2)) await j.app.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  await attends(600);
  env.verifie((await H.evaluate(() => window.faceOff.lan.partie.phase)) === 'fin', 'trois votes sur quatre : pas de revanche');
  await j4.page.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  for (const p of [H, ...joueurs.map((j) => j.app.page)]) {
    env.verifie(await env.attendsQue(p, () => window.faceOff.ecranUI === 'jeu' && window.faceOff.state.score[0] === 0, undefined, 8000), 'revanche : nouveau match');
  }
  env.verifie(await H.evaluate(() => window.faceOff.state.duo.every(Boolean)), 'toujours quatre humains');

  // ---- un joueur s'en va : tout le monde retourne en salle d'attente, son siège est libre
  await j4.page.evaluate(() => window.faceOff.lan.ouvre());
  env.verifie(await env.attendsQue(H, () => window.faceOff.ecranUI === 'salon' && !window.faceOff.lan.partie.sieges[3], undefined, 8000), 'le départ d\'un joueur ramène l\'hôte en salle d\'attente');
  env.verifie(await env.attendsQue(j3.page, () => window.faceOff.ecranUI === 'salon' && window.faceOff.lan.siege === 2), 'les autres joueurs gardent leur siège');
  env.verifie(await env.attendsQue(spects[1].page, () => window.faceOff.ecranUI === 'salon'), 'les spectateurs retrouvent la salle d\'attente');
  // et un spectateur peut prendre le siège libéré
  await spects[1].page.evaluate(() => window.faceOff.lan.prendSiege(3));
  env.verifie(await env.attendsQue(H, () => window.faceOff.lan.partie.sieges[3]?.nom === 'PAUL' && window.faceOff.lan.partie.spectateurs.length === 2), 'un spectateur prend le siège libéré');
  await env.capture(H, '9-salon-apres-depart');
}
