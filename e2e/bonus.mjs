/**
 * Bonus en solo : jauge affichée, 4e passe (gros « BONUS » doré, sans combo),
 * tirage puis départ automatique du bonus, but x2 limité à 10 s, freeze,
 * inversion, full esquive, tir surpuissant (bouton TIR doré), surnombre, un
 * but qui coupe tout, l'option du menu qui désactive les bonus, et le mode
 * entraînement.
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
  // un but (de l'ordinateur ou d'un tir de bonus) suspend le jeu : on attend la remise en jeu avant chaque étape
  const enJeu = async () => {
    if (await env.attendsQue(p, () => window.faceOff.state.phase === 'jeu' && !window.faceOff.ralenti.actif, undefined, 12000)) return;
    const etat = await p.evaluate(() => ({ ecran: window.faceOff.ecranUI, phase: window.faceOff.state.phase, ralenti: window.faceOff.ralenti.actif }));
    env.verifie(false, `remise en jeu attendue (${JSON.stringify(etat)})`);
  };
  const j0 = await pv(0);
  env.verifie(j0 && j0.seuil === 4 && j0.passes === 0, 'jauge des bonus : 0 / 4 passes');
  await p.evaluate(() => (window.faceOff.state.pouvoirs[0].passes = 2));
  await attends(200);
  await env.capture(p, '1-jauge');

  // le palet au joueur piloté, les adversaires loin : personne ne vient le voler pendant le test
  const donnePalet = () =>
    p.evaluate(() => {
      const st = window.faceOff.state;
      const s = st.controles[0];
      if (st.palet.porteur) st.palet.porteur.tient = false;
      st.palet.porteur = s;
      st.palet.dernier = s;
      s.tient = true;
      s.recupCd = 0;
      for (const o of st.patineurs) {
        if (o.eq !== 1) continue;
        o.x = s.x + 150;
        o.y = s.y + 60;
        o.vx = o.vy = 0;
      }
    });

  // 4e passe réussie (une vraie passe, touche L) : gros « BONUS » doré, pas de « COMBO x4 »
  let tire = false;
  for (let essai = 0; essai < 4 && !tire; essai++) {
    await enJeu();
    await p.evaluate(() => {
      const pv = window.faceOff.state.pouvoirs[0];
      Object.assign(pv, { passes: 3, pret: null, actif: null, tirage: 0 });
    });
    await donnePalet();
    await touche('KeyL');
    tire = await env.attendsQue(p, () => window.faceOff.state.pouvoirs[0].tirage > 0, undefined, 1500);
  }
  env.verifie(tire, '4e passe : le tirage du bonus démarre');
  await attends(120);
  await env.capture(p, '2-pop-bonus');
  const bulles = await p.evaluate(() => window.faceOff.effets.bulles.map((b) => ({ txt: b.txt, gros: !!b.gros })));
  env.verifie(bulles.some((b) => b.txt === 'BONUS' && b.gros), 'gros « BONUS » doré au-dessus du joueur');
  env.verifie(!bulles.some((b) => b.txt.startsWith('COMBO')), `pas de « COMBO x4 » en même temps (${bulles.map((b) => b.txt)})`);
  await attends(500);
  await env.capture(p, '3-tirage');
  // à la fin du tirage, le bonus part tout seul (aucun bouton à toucher)
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.pouvoirs[0].actif !== null, undefined, 3000), 'fin du tirage : le bonus part tout seul');
  const j1 = await pv(0);
  env.verifie(j1.pret === null && j1.seuil === 4, 'prochain bonus : toujours 4 passes');
  await attends(150);
  await env.capture(p, '4-bonus-parti');

  // chaque bonus, donné directement : il part dès la fin du tirage
  const donne = async (id) => {
    await enJeu();
    await p.evaluate((i) => {
      const pv = window.faceOff.state.pouvoirs[0];
      pv.actif = null;
      pv.pret = i;
      pv.tirage = 0;
    }, id);
    return env.attendsQue(p, (i) => window.faceOff.state.pouvoirs[0].actif === i, id, 1500);
  };

  // but x2 : lui aussi a une fin (10 s)
  env.verifie(await donne('double'), 'BUT X2 en cours');
  const reste = (await pv(0)).reste;
  env.verifie(reste > 9 && reste <= 10, `BUT X2 : 10 s, pas jusqu'au prochain but (${reste.toFixed(1)})`);
  await env.capture(p, '5-double');

  // freeze : tout le monde est pris dans la glace, sauf le joueur doré
  env.verifie(await donne('freeze'), 'FREEZE en cours');
  const xs = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.eq === 1).map((s) => s.x));
  await attends(400);
  await env.capture(p, '6-freeze');
  const xs2 = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.eq === 1).map((s) => s.x));
  env.verifie(xs.every((x, i) => Math.abs(x - xs2[i]) < 0.01), 'les adversaires ne bougent plus');

  // inversion : spirales au-dessus des adversaires
  env.verifie(await donne('inversion'), 'INVERSION en cours');
  await attends(500);
  await env.capture(p, '7-inversion');

  // full esquive (ex-mode savon)
  env.verifie(await donne('savon'), 'FULL ESQUIVE en cours');
  env.verifie((await p.evaluate(() => window.faceOff.state.pouvoirs[0].actif)) === 'savon', 'FULL ESQUIVE : bonus actif');

  // tir surpuissant : le bouton TIR passe en or ; un tir normal (ESPACE) part surpuissant
  await enJeu();
  await donnePalet();
  env.verifie(await donne('puissant'), 'SUPER TIR en cours');
  await donnePalet();
  await attends(250);
  await env.capture(p, '8a-bouton-tir-dore');
  await p.keyboard.down('Space');
  await attends(350);
  env.verifie(await p.evaluate(() => window.faceOff.state.controles[0].arme), 'ESPACE maintenue : tir en charge');
  await p.keyboard.up('Space');
  await attends(40);
  const parti = await p.evaluate(() => {
    const st = window.faceOff.state;
    return { actif: st.pouvoirs[0].actif, tient: st.controles[0].tient, geste: st.patineurs.some((s) => s.tirT > 0), puissant: st.palet.puissant || st.palet.lueur === 3 };
  });
  env.verifie(parti.actif === null && !parti.tient, 'ESPACE relâchée : tir surpuissant parti, bonus consommé');
  env.verifie(parti.geste, 'le geste de tir (descente, impact, accompagnement) se joue');
  await env.capture(p, '8b-surpuissant');

  // lot B : chaque bonus part, avec son rendu
  env.verifie(await donne('heros'), 'SUPER HEROS en cours');
  const heros = await p.evaluate(() => {
    const st = window.faceOff.state;
    return { geles: st.patineurs.filter((s) => s.eq === 1).map((s) => s.x) };
  });
  await attends(300);
  const heros2 = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.eq === 1).map((s) => s.x));
  env.verifie(heros.geles.every((x, i) => Math.abs(x - heros2[i]) < 0.01), 'SUPER HEROS : les adversaires sont gelés au début');
  await env.capture(p, '10a-heros');

  env.verifie(await donne('tremblement'), 'TREMBLEMENT en cours');
  await attends(150);
  const tremble = await p.evaluate(() => {
    const st = window.faceOff.state;
    const porteur = st.palet.porteur;
    return { au_sol: st.patineurs.filter((s) => s !== porteur && s.chuteT > 0).length, total: st.patineurs.filter((s) => s !== porteur).length, secousse: window.faceOff.effets.secousse };
  });
  env.verifie(tremble.au_sol === tremble.total, `TREMBLEMENT : tout le monde au sol sauf le porteur (${tremble.au_sol}/${tremble.total})`);
  env.verifie(tremble.secousse > 1, `TREMBLEMENT : l'écran tremble (${tremble.secousse.toFixed(1)})`);
  await env.capture(p, '10b-tremblement');

  env.verifie(await donne('givre'), 'GIVRE en cours');
  await attends(700);
  await env.capture(p, '10c-givre');

  env.verifie(await donne('geante'), 'CAGE GEANTE en cours');
  await attends(300);
  await env.capture(p, '10d-cage-geante');
  // un but dans la cage géante : elle le reste pendant tout le but (célébration, ralenti), puis reprend sa taille
  await p.evaluate(() => {
    const st = window.faceOff.state;
    const app = window.faceOff;
    for (const s of st.patineurs) s.y = app.rink.cy + 60;
    st.gardiens[1].a = 1.3;
    st.gardiens[1].vit = 0;
    const pal = st.palet;
    if (pal.porteur) pal.porteur.tient = false;
    pal.porteur = null;
    pal.x = app.rink.butD - 12;
    pal.y = app.rink.cy - 10;
    pal.vx = 420;
    pal.vy = 0;
  });
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'but', undefined, 3000), 'but marqué dans la cage géante');
  await attends(1500);
  const pendantBut = await p.evaluate(() => ({ phase: window.faceOff.state.phase, actif: window.faceOff.state.pouvoirs[0].actif }));
  env.verifie(pendantBut.phase === 'but' && pendantBut.actif === 'geante', `la cage reste géante pendant le but (${JSON.stringify(pendantBut)})`);
  await env.capture(p, '10d2-but-cage-geante');
  await p.evaluate(() => window.faceOff.passeRalenti?.());
  await enJeu();
  env.verifie((await p.evaluate(() => window.faceOff.state.pouvoirs[0].actif)) === null, 'après la remise en jeu, la cage a repris sa taille');

  // super passe : une passe arrive toujours au coéquipier, même avec des adversaires pile sur la ligne
  env.verifie(await donne('superpasse'), 'SUPER PASSE en cours');
  let recu = 0;
  for (let essai = 0; essai < 3; essai++) {
    await enJeu();
    await p.evaluate(() => {
      const st = window.faceOff.state;
      const r = window.faceOff.rink;
      const s = st.controles[0];
      const eq = st.patineurs.filter((m) => m.eq === 0 && m !== s);
      const au = st.patineurs.filter((m) => m.eq === 1);
      Object.assign(s, { x: r.cx - 80, y: r.cy, vx: 0, vy: 0 });
      Object.assign(eq[0], { x: r.cx + 80, y: r.cy, vx: 0, vy: 0 });
      Object.assign(eq[1], { x: r.cx - 120, y: r.y + 20, vx: 0, vy: 0 });
      Object.assign(au[0], { x: r.cx - 10, y: r.cy, vx: 0, vy: 0 });
      Object.assign(au[1], { x: r.cx + 40, y: r.cy + 2, vx: 0, vy: 0 });
      Object.assign(au[2], { x: r.cx + 100, y: r.y + 12, vx: 0, vy: 0 });
      for (const m of st.patineurs) m.recupCd = 0;
      // les adversaires restent plantés sur la ligne : seule l'interception de la passe est en jeu
      for (const m of au) m.vit = 0.01;
      if (st.palet.porteur) st.palet.porteur.tient = false;
      st.palet.porteur = s;
      st.palet.dernier = s;
      s.tient = true;
      st.pouvoirs[0].passes = 0;
      st.pouvoirs[0].reste = 8;
    });
    const avant = await p.evaluate(() => window.faceOff.state.stats.passes[0]);
    await p.keyboard.down('ArrowRight');
    await attends(50);
    await p.keyboard.press('KeyL');
    await attends(60);
    await p.keyboard.up('ArrowRight');
    await attends(150);
    if (essai === 0) await env.capture(p, '10f-super-passe');
    // la passe arrive (jusqu'à 2,5 s : la machine peut être lente)
    await env.attendsQue(p, () => !window.faceOff.state.palet.passe && !!window.faceOff.state.palet.porteur, undefined, 2500);
    // une passe réussie de plus, et un coéquipier tient le palet
    recu += await p.evaluate((n) => {
      const st = window.faceOff.state;
      const po = st.palet.porteur;
      return st.stats.passes[0] === n + 1 && po && po.eq === 0 ? 1 : 0;
    }, avant);
  }
  env.verifie(recu === 3, `SUPER PASSE : 3 passes sur 3 arrivent au coéquipier (${recu}/3)`);

  env.verifie(await donne('minicage'), 'MINI CAGE en cours');
  await attends(300);
  await env.capture(p, '10e-mini-cage');

  env.verifie(await donne('endormi'), 'GARDIEN ENDORMI en cours');
  const a0 = await p.evaluate(() => window.faceOff.state.gardiens[1].a);
  await attends(500);
  env.verifie((await p.evaluate(() => window.faceOff.state.gardiens[1].a)) === a0, 'GARDIEN ENDORMI : le gardien adverse ne bouge plus');
  await env.capture(p, '10f-endormi');

  await enJeu();
  await donnePalet();
  env.verifie(await donne('blackout'), 'BLACKOUT en cours');
  await attends(700);
  await env.capture(p, '10g-blackout');

  // lot C : envahissement, les supporters aux couleurs de l'équipe filent sur les adversaires
  // (réessai : un but du CPU juste après le départ coupe le bonus et renvoie les supporters)
  let foule = -1;
  for (let essai = 0; essai < 4 && foule !== 5; essai++) {
    env.verifie(await donne('envahissement'), 'FOULE en cours');
    foule = await p.evaluate(() => window.faceOff.state.supporters.length);
  }
  env.verifie(foule === 5, `FOULE : 5 supporters sur la glace (${foule})`);
  await attends(900);
  await env.capture(p, '11a-envahissement');
  await p.evaluate(() => window.faceOff.state.pouvoirs[0].actif && (window.faceOff.state.pouvoirs[0].reste = 0.01));
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.supporters.length === 0, undefined, 5000), 'fin du bonus : les supporters repartent');

  // lot C : loupé complet (bonus de l'ordinateur) — notre tir part vers la caméra et brise l'écran
  await enJeu();
  await p.evaluate(() => {
    const pv = window.faceOff.state.pouvoirs[1];
    Object.assign(pv, { pret: 'loupe', tirage: 0, actif: null });
  });
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.pouvoirs[1].actif === 'loupe', undefined, 1500), 'LOUPE COMPLET de l\'adversaire en cours');
  await donnePalet();
  await p.keyboard.down('Space');
  await attends(150);
  await p.keyboard.up('Space');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'loupe', undefined, 1000), 'notre tir : phase LOUPÉ (le palet vole vers la caméra)');
  await attends(250);
  await env.capture(p, '11b-loupe-vol');
  await attends(600);
  await env.capture(p, '11c-loupe-ecran-brise');
  const apres = await p.evaluate(() => ({ score: window.faceOff.state.score, actif: window.faceOff.state.pouvoirs[1].actif }));
  env.verifie(apres.actif === null, 'LOUPÉ : le bonus est consommé');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'engagement' || window.faceOff.state.phase === 'jeu', undefined, 3000), 'LOUPÉ : engagement au centre ensuite');

  // surnombre : un renfort doré et semi-transparent entre sur la glace
  // (un but de l'ordinateur juste après le départ coupe tous les bonus et fait repartir le renfort : on réessaie)
  let renfortOk = false;
  for (let essai = 0; essai < 4 && !renfortOk; essai++) {
    const n0 = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => !s.renfort).length);
    env.verifie(await donne('surnombre'), 'SURNOMBRE en cours');
    await attends(400);
    renfortOk = await p.evaluate(
      (n) => window.faceOff.state.patineurs.filter((s) => s.renfort).length === 1 && window.faceOff.state.patineurs.length === n + 1,
      n0,
    );
  }
  env.verifie(renfortOk, 'SURNOMBRE : un renfort entre');
  await env.capture(p, '9a-surnombre');

  // un but met fin à tous les bonus
  await p.evaluate(() => {
    const st = window.faceOff.state;
    const app = window.faceOff;
    for (const s of st.patineurs) s.y = app.rink.cy + 60;
    st.gardiens[1].a = 1.3;
    st.gardiens[1].vit = 0;
    const pal = st.palet;
    if (pal.porteur) pal.porteur.tient = false;
    pal.porteur = null;
    pal.x = app.rink.butD - 12;
    pal.y = app.rink.cy - 10;
    pal.vx = 420;
    pal.vy = 0;
  });
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'but', undefined, 2000), 'but marqué');
  const fin = await p.evaluate(() => window.faceOff.state.pouvoirs.map((x) => x.actif));
  env.verifie(fin[0] === null && fin[1] === null, 'le but met fin aux bonus en cours');
  env.verifie(!(await p.evaluate(() => window.faceOff.state.patineurs.some((s) => s.renfort))), 'le renfort repart avec le but');
  await attends(150);
  await env.capture(p, '9b-but');

  // option du menu : sans bonus, pas de jauge
  await p.evaluate(() => {
    window.faceOff.pref.bonus = false;
    window.faceOff.solo.rejoue();
  });
  await attends(300);
  env.verifie((await pv(0)) === null, 'option BONUS NON : aucun bonus en match');
  await env.capture(p, '9d-sans-bonus');

  // mode entraînement (réglages avancés) : grille des bonus, choix gardé, match sans chrono
  await p.evaluate(() => window.faceOff.retourMenu());
  await p.evaluate(() => (window.faceOff.ecranUI = 'avance'));
  await p.evaluate(() => window.faceOff.solo.ouvreEntrainement());
  env.verifie((await p.evaluate(() => window.faceOff.ecranUI)) === 'entrainement', 'écran entraînement');
  await touche('ArrowDown');
  await touche('ArrowRight');
  const choix = await p.evaluate(() => window.faceOff.pref.bonusEntrainement);
  await env.capture(p, '10-entrainement');
  await touche('Enter');
  env.verifie((await p.evaluate(() => window.faceOff.ecranUI)) === 'jeu', 'ENTRÉE : match d\'entraînement lancé');
  env.verifie((await p.evaluate(() => window.faceOff.state.entrainement)) === choix, `bonus d'entraînement : ${choix}`);
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.pouvoirs?.[0].actif === window.faceOff.pref.bonusEntrainement, undefined, 4000), 'le bonus choisi part tout seul');
  const h0 = await p.evaluate(() => window.faceOff.state.horloge);
  await attends(600);
  env.verifie((await p.evaluate(() => window.faceOff.state.horloge)) === h0, 'pas de chrono en entraînement');
  await env.capture(p, '11-entrainement-match');
}
