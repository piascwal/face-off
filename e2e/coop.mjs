/**
 * Mode coop : l'hôte et l'invité forment la même équipe contre le CPU.
 * L'hôte choisit seul les deux équipes (l'invité regarde et n'a rien à valider) ;
 * il pilote un patineur de l'équipe 0, l'invité le second ; l'équipe 1
 * n'a aucun humain ; les commandes, le tir, le but et le score passent d'un
 * écran à l'autre ; un bonus profite aux deux ; fin de match et revanche.
 */
import { attends, lan } from './outils.mjs';

export default async function coop(env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12', stockage: { coopWifi: true, bonus: true, niveau: 1 } });
  const invite = await env.appareil('INVITE', { pseudo: 'BISON 15' });
  const H = hote.page;
  const I = invite.page;
  await H.evaluate(() => window.faceOff.lan.ouvreConfig());
  await attends(300);
  await env.capture(H, '0-config');
  await lan.connecte(env, hote, invite);
  env.verifie(await H.evaluate(() => window.faceOff.lan.partie.config.coop), 'la partie est créée en coop');
  env.verifie(await env.attendsQue(I, () => window.faceOff.lan.partie?.config.coop === true), 'l\'invité voit une partie coop dans le salon');
  await env.capture(H, '0-salon-hote');
  await env.capture(I, '0-salon-invite');

  // choix des équipes : l'hôte règle l'équipe commune ET celle du CPU, l'invité regarde
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'lancer' }));
  await attends(500);
  env.verifie(await env.attendsQue(I, () => window.faceOff.ecranUI === 'lanChoix'), 'l\'invité arrive au choix des équipes');
  const choix = () => H.evaluate(() => window.faceOff.lan.partie.joueurs.map((j) => j.equipe));
  const e0 = await choix();
  await I.evaluate(() => { window.faceOff.lan.tourneEquipe(1, 0); window.faceOff.lan.tourneEquipe(1, 1); });
  await attends(300);
  env.verifie((await choix()).join() === e0.join(), 'l\'invité ne change aucune équipe');
  await H.evaluate(() => { window.faceOff.lan.tourneEquipe(1, 0); window.faceOff.lan.tourneEquipe(1, 1); window.faceOff.lan.tourneEquipe(1, 1); });
  await attends(300);
  const e1 = await choix();
  env.verifie(e1[0] !== e0[0] && e1[1] !== e0[1], `l'hôte change l'équipe commune et celle du CPU (${e0} -> ${e1})`);
  env.verifie(await env.attendsQue(I, (eq) => window.faceOff.lan.partie.joueurs.map((j) => j.equipe).join() === eq, e1.join()), 'l\'invité voit ces choix');
  await env.capture(H, '0-choix-hote');
  await env.capture(I, '0-choix-invite');
  // l'invité n'a rien à valider : le « prêt » de l'hôte suffit
  await I.evaluate(() => window.faceOff.lan.agit({ a: 'pret', pret: true }));
  await attends(300);
  env.verifie(await H.evaluate(() => window.faceOff.lan.partie.phase) === 'equipes', 'le « prêt » de l\'invité ne compte pas');
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'pret', pret: true }));
  env.verifie(await env.attendsQue(H, () => window.faceOff.lan.partie.phase === 'maillots', undefined, 3000), 'l\'hôte seul fait passer aux maillots');
  const maillotCpu = await H.evaluate(() => window.faceOff.lan.partie.joueurs[1].variante);
  await H.evaluate(() => window.faceOff.lan.tourneEquipe(1, 1));
  await attends(300);
  env.verifie(await H.evaluate(() => window.faceOff.lan.partie.joueurs[1].variante) !== maillotCpu, 'l\'hôte règle aussi le maillot du CPU');
  await env.capture(I, '0-maillots-invite');
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'pret', pret: true }));
  env.verifie(await env.attendsQue(I, () => window.faceOff.ecranUI === 'jeu', undefined, 6000), 'le match démarre chez l\'invité sans qu\'il ait rien validé');
  env.verifie(await env.attendsQue(H, () => window.faceOff.state.phase === 'jeu', undefined, 8000), 'engagement joué');
  env.verifie(
    await H.evaluate((eq) => window.faceOff.equipesActuelles[0].teamId === eq[0] && window.faceOff.equipesActuelles[1].teamId === eq[1], e1),
    'les deux équipes sont celles choisies par l\'hôte',
  );


  // 1) les deux humains sont dans l'équipe 0, le CPU garde l'équipe 1
  const roles = await H.evaluate(() => {
    const st = window.faceOff.state;
    return {
      coop: st.coop,
      humains: st.humains,
      distincts: !!st.controles[0] && !!st.partenaire && st.controles[0] !== st.partenaire,
      eqPartenaire: st.partenaire?.eq,
      humainsParEquipe: [0, 1].map((e) => st.patineurs.filter((s) => s.eq === e && s.humain).length),
    };
  });
  env.verifie(roles.coop && roles.humains[0] && !roles.humains[1], 'coop : une seule équipe humaine');
  env.verifie(roles.distincts && roles.eqPartenaire === 0, 'l\'hôte et l\'invité pilotent deux patineurs différents de l\'équipe 0');
  env.verifie(roles.humainsParEquipe[0] === 2 && roles.humainsParEquipe[1] === 0, `deux humains à gauche, aucun à droite (${roles.humainsParEquipe})`);
  env.verifie(await I.evaluate(() => window.faceOff.lan.eqLocal) === 0, 'l\'invité joue l\'équipe 0');
  env.verifie(
    await env.attendsQue(I, () => window.faceOff.state.coop && !!window.faceOff.state.partenaire && window.faceOff.lan.pilote(window.faceOff.state) === window.faceOff.state.partenaire, undefined, 3000),
    'chez l\'invité, son patineur piloté est le partenaire',
  );
  await env.capture(I, '1-invite');
  await env.capture(H, '1-hote');

  const enJeu = async () => {
    const ok = await env.attendsQue(H, () => window.faceOff.state.phase === 'jeu' && !window.faceOff.ralenti?.actif, undefined, 15000);
    if (!ok) env.verifie(false, `remise en jeu attendue (${await H.evaluate(() => window.faceOff.state.phase)})`);
  };
  // le calme : palet loin, ordinateur écarté
  const prepare = (page) =>
    page.evaluate(() => {
      const st = window.faceOff.state;
      if (st.palet.porteur) st.palet.porteur.tient = false;
      st.palet.porteur = null;
      st.palet.x = st.palet.y = 30;
      st.palet.vx = st.palet.vy = 0;
    });
  const pos = (page, quoi) =>
    page.evaluate((q) => {
      const st = window.faceOff.state;
      const s = q === 'invite' ? st.partenaire : st.controles[0];
      return s ? { x: s.x, y: s.y } : null;
    }, quoi);

  // 2) chacun pilote son patineur, et seulement le sien (changement automatique coupé : on suit des patineurs précis)
  await H.evaluate(() => { window.faceOff.state.changementAuto = false; });
  await enJeu();
  await prepare(H);
  // chacun à son bout de la glace, les autres joueurs hors du chemin
  await H.evaluate(() => {
    const st = window.faceOff.state;
    const app = window.faceOff;
    const h = st.controles[0];
    const i = st.partenaire;
    Object.assign(h, { x: app.rink.x + 40, y: app.rink.cy - 30, vx: 0, vy: 0 });
    Object.assign(i, { x: app.rink.x + app.rink.w - 40, y: app.rink.cy + 30, vx: 0, vy: 0 });
    for (const o of st.patineurs) if (o !== h && o !== i) Object.assign(o, { x: app.rink.cx, y: app.rink.y + 14, vx: 0, vy: 0 });
  });
  const h0 = await pos(H, 'hote');
  const i0 = await pos(H, 'invite');
  await I.keyboard.down('ArrowLeft');
  await attends(700);
  await I.keyboard.up('ArrowLeft');
  await attends(1400); // il glisse encore un peu sur la glace
  const h1 = await pos(H, 'hote');
  const i1 = await pos(H, 'invite');
  env.verifie(i0.x - i1.x > 15, `les touches de l'invité déplacent son patineur chez l'hôte (${i0.x.toFixed(0)} -> ${i1.x.toFixed(0)})`);
  env.verifie(Math.hypot(h1.x - h0.x, h1.y - h0.y) < 6, 'et pas celui de l\'hôte');
  const i1vu = await pos(I, 'invite');
  env.verifie(Math.abs(i1vu.x - i1.x) < 12 && Math.abs(i1vu.y - i1.y) < 12, 'l\'invité voit son patineur au même endroit que l\'hôte');
  await prepare(H);
  await H.keyboard.down('ArrowRight');
  await attends(700);
  await H.keyboard.up('ArrowRight');
  await attends(300);
  const h3 = await pos(H, 'hote');
  const i3 = await pos(H, 'invite');
  env.verifie(h3.x - h1.x > 15, 'les touches de l\'hôte déplacent le sien');
  env.verifie(Math.hypot(i3.x - i1.x, i3.y - i1.y) < 8, 'et pas celui de l\'invité');

  // 3) l'invité tire : le geste est vu des deux côtés
  await enJeu();
  await H.evaluate(() => {
    const st = window.faceOff.state;
    const s = st.partenaire;
    if (st.palet.porteur) st.palet.porteur.tient = false;
    s.x = window.faceOff.rink.cx + 60;
    s.y = window.faceOff.rink.cy - 40;
    s.recupCd = 0;
    st.palet.porteur = s;
    st.palet.dernier = s;
    s.tient = true;
    for (const o of st.patineurs) if (o !== s) Object.assign(o, { x: s.x - 120, y: s.y + 70, vx: 0, vy: 0 });
  });
  await attends(150);
  await I.keyboard.down('Space');
  await attends(350);
  env.verifie(await H.evaluate(() => window.faceOff.state.partenaire.arme), 'ESPACE maintenue par l\'invité : son tir se charge chez l\'hôte');
  await I.keyboard.up('Space');
  env.verifie(await env.attendsQue(H, () => window.faceOff.state.patineurs.some((s) => s.eq === 0 && s.tirT > 0), undefined, 1500), 'tir lâché : le geste se joue chez l\'hôte');
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.patineurs.some((s) => s.eq === 0 && s.tirT > 0), undefined, 1500), 'et chez l\'invité');

  // 4) but de l'équipe : même score des deux côtés, pas de point pour le CPU
  await enJeu();
  await H.evaluate(() => {
    const st = window.faceOff.state;
    const app = window.faceOff;
    for (const s of st.patineurs) s.y = app.rink.cy + 70;
    st.gardiens[1].a = 1.3;
    st.gardiens[1].vit = 0;
    const p = st.palet;
    if (p.porteur) p.porteur.tient = false;
    p.porteur = null;
    p.x = app.rink.butD - 12;
    p.y = app.rink.cy - 10;
    p.vx = 420;
    p.vy = 0;
  });
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.phase === 'but', undefined, 3000), 'but : la célébration démarre chez l\'invité');
  const scores = [await H.evaluate(() => [...window.faceOff.state.score]), await I.evaluate(() => [...window.faceOff.state.score])];
  env.verifie(scores[0].join() === '1,0' && scores[1].join() === '1,0', `1-0 des deux côtés (${scores[0]} / ${scores[1]})`);
  await env.capture(I, '4-but');
  await attends(300);
  await H.evaluate(() => window.faceOff.passeRalenti?.());
  await I.evaluate(() => window.faceOff.passeRalenti?.());
  await enJeu();

  // 5) changement de joueur : chacun prend un coéquipier CPU, jamais celui de l'autre
  await prepare(H);
  const avant = await H.evaluate(() => {
    const st = window.faceOff.state;
    return { h: st.patineurs.indexOf(st.controles[0]), i: st.patineurs.indexOf(st.partenaire) };
  });
  await I.keyboard.press('KeyL');
  await attends(500);
  const apres = await H.evaluate(() => {
    const st = window.faceOff.state;
    const humains = st.patineurs.filter((s) => s.humain);
    return { h: st.patineurs.indexOf(st.controles[0]), i: st.patineurs.indexOf(st.partenaire), nb: humains.length, eq: humains.map((s) => s.eq) };
  });
  env.verifie(apres.nb === 2 && apres.eq.every((e) => e === 0) && apres.h !== apres.i, 'toujours deux humains distincts dans l\'équipe 0 après un changement');
  env.verifie(apres.h === avant.h, 'le changement de l\'invité n\'a pas pris le patineur de l\'hôte');

  // 5 bis) passe de l'invité vers un coéquipier CPU : c'est lui qui garde la main, pas l'hôte
  await enJeu();
  const passe = await H.evaluate(() => {
    const st = window.faceOff.state;
    const r = window.faceOff.rink;
    const s = st.partenaire;
    const h = st.controles[0];
    const cpu = st.patineurs.find((m) => m.eq === 0 && !m.humain);
    Object.assign(s, { x: r.cx - 40, y: r.cy, vx: 0, vy: 0 });
    Object.assign(h, { x: r.cx - 140, y: r.cy + 50, vx: 0, vy: 0 });
    Object.assign(cpu, { x: r.cx + 40, y: r.cy, vx: 0, vy: 0 });
    if (st.palet.porteur) st.palet.porteur.tient = false;
    st.palet.porteur = s;
    st.palet.dernier = s;
    s.tient = true;
    s.recupCd = 0;
    for (const o of st.patineurs) if (o.eq === 1) Object.assign(o, { x: r.cx, y: r.y + 10, vx: 0, vy: 0 });
    return { h: st.patineurs.indexOf(h), cpu: st.patineurs.indexOf(cpu), passes: st.stats.passes[0] };
  });
  await I.keyboard.down('ArrowRight');
  await attends(60);
  await I.keyboard.press('KeyL');
  await attends(80);
  await I.keyboard.up('ArrowRight');
  await attends(900);
  const apresPasse = await H.evaluate(() => {
    const st = window.faceOff.state;
    return { h: st.patineurs.indexOf(st.controles[0]), i: st.patineurs.indexOf(st.partenaire), passes: st.stats.passes[0] };
  });
  env.verifie(apresPasse.i === passe.cpu && apresPasse.h === passe.h, `passe de l'invité : il prend la main sur le receveur, l'hôte garde la sienne (${JSON.stringify(passe)} -> ${JSON.stringify(apresPasse)})`);
  env.verifie(apresPasse.passes === passe.passes + 1, 'la passe compte');

  // 6) bonus : il profite aux deux humains
  await enJeu();
  await H.evaluate(() => Object.assign(window.faceOff.state.pouvoirs[0], { actif: null, pret: 'savon', tirage: 0 }));
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.pouvoirs?.[0].actif === 'savon', undefined, 4000), 'FULL ESQUIVE : l\'invité voit le bonus de l\'équipe');
  await H.evaluate(() => {
    const st = window.faceOff.state;
    st.palet.porteur = st.controles[0];
    st.controles[0].tient = true;
  });
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.pouvoirs[0].dore === 0, undefined, 2000), 'l\'or est sur l\'hôte tant qu\'il a le palet');
  await H.evaluate(() => {
    const st = window.faceOff.state;
    st.controles[0].tient = false;
    st.palet.porteur = st.partenaire;
    st.partenaire.tient = true;
  });
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.pouvoirs[0].dore === 1, undefined, 2000), 'le palet passe à l\'invité : l\'or le suit (chez les deux)');
  env.verifie(await H.evaluate(() => window.faceOff.state.pouvoirs[0].dore) === 1, 'idem chez l\'hôte');
  await env.capture(I, '6-bonus');

  // 7) fin de match : même résultat pour les deux, puis revanche à deux votes
  await enJeu();
  await lan.termineMatch(hote, [3, 1]);
  env.verifie(await env.attendsQue(H, () => window.faceOff.ecranUI === 'fin', undefined, 5000), 'fin de match chez l\'hôte');
  env.verifie(await env.attendsQue(I, () => window.faceOff.ecranUI === 'fin', undefined, 5000), 'fin de match chez l\'invité');
  const fin = [await H.evaluate(() => [...window.faceOff.state.score]), await I.evaluate(() => [...window.faceOff.state.score])];
  env.verifie(fin[0].join() === '3,1' && fin[1].join() === '3,1', `même score final (${fin[0]} / ${fin[1]})`);
  await attends(900);
  await env.capture(H, '7-fin-hote');
  await env.capture(I, '7-fin-invite');
  const duels = await H.evaluate(() => Object.keys(window.faceOff.pref.duels).length);
  env.verifie(duels === 0, 'pas de bilan de duel en coop (le CPU n\'est pas un adversaire humain)');
  await H.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  await I.evaluate(() => window.faceOff.lan.agit({ a: 'vote', vote: 'rejouer' }));
  env.verifie(await env.attendsQue(I, () => window.faceOff.ecranUI === 'jeu' && window.faceOff.state.score[0] === 0, undefined, 8000), 'revanche : nouveau match en coop chez l\'invité');
  env.verifie(await H.evaluate(() => window.faceOff.state.coop && !!window.faceOff.state.partenaire), 'et toujours en coop chez l\'hôte');
}
