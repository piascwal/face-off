/**
 * Deux joueurs sur le même Wi-Fi, un vrai match : les commandes de l'invité
 * pilotent son joueur chez l'hôte, les deux écrans voient la même chose (positions,
 * tir, but, score), les bonus (supporters, cages, loupé complet, effets d'écran)
 * passent d'un écran à l'autre, puis fin de match, mêmes résultats, revanche.
 */
import { attends, lan } from './outils.mjs';

export default async function multi(env) {
  const hote = await env.appareil('HOTE', { pseudo: 'LYNX 12', stockage: { bonus: true } });
  const invite = await env.appareil('INVITE', { pseudo: 'BISON 15' });
  await lan.connecte(env, hote, invite);
  await lan.lanceMatch(env, hote, invite);
  const H = hote.page;
  const I = invite.page;
  const etat = (page, f, arg) => page.evaluate(f, arg);
  const enJeu = async () => {
    const ok = await env.attendsQue(H, () => window.faceOff.state.phase === 'jeu' && !window.faceOff.ralenti?.actif, undefined, 15000);
    if (!ok) env.verifie(false, `remise en jeu attendue (${await H.evaluate(() => window.faceOff.state.phase)})`);
  };
  env.verifie(await env.attendsQue(H, () => window.faceOff.state.phase === 'jeu', undefined, 8000), 'engagement joué chez l\'hôte');
  env.verifie(await etat(I, () => window.faceOff.lan.eqLocal) === 1, 'l\'invité joue l\'équipe 1');
  env.verifie(await etat(I, () => !!window.faceOff.state.pouvoirs), 'les bonus sont actifs chez l\'invité (réglage de l\'hôte)');
  await env.capture(I, '1-invite');
  await env.capture(H, '1-hote');

  // le calme : on place les joueurs, le palet loin, l'ordinateur n'existe pas (deux humains)
  const prepare = (page) =>
    page.evaluate(() => {
      const st = window.faceOff.state;
      if (st.palet.porteur) st.palet.porteur.tient = false;
      st.palet.porteur = null;
      st.palet.x = st.palet.y = 30;
      st.palet.vx = st.palet.vy = 0;
    });

  // 1) les commandes de l'invité pilotent son joueur chez l'hôte
  await enJeu();
  await prepare(H);
  const pos = (page) => page.evaluate(() => { const s = window.faceOff.state.controles[1]; return s ? { x: s.x, y: s.y } : null; });
  const p0 = await pos(H);
  await I.keyboard.down('ArrowLeft');
  await attends(900);
  await I.keyboard.up('ArrowLeft');
  await attends(300);
  const p1h = await pos(H);
  const p1i = await pos(I);
  env.verifie(p1h && p1h.x < p0.x - 15, `ARROW GAUCHE de l'invité : son joueur avance chez l'hôte (${p0.x.toFixed(0)} -> ${p1h?.x.toFixed(0)})`);
  env.verifie(p1i && Math.abs(p1i.x - p1h.x) < 12 && Math.abs(p1i.y - p1h.y) < 12, `l'invité voit son joueur au même endroit (${p1i?.x.toFixed(0)} / ${p1h?.x.toFixed(0)})`);

  // 2) tir de l'invité : le geste et le palet sont vus des deux côtés
  await enJeu();
  await H.evaluate(() => {
    const st = window.faceOff.state;
    const s = st.controles[1];
    if (st.palet.porteur) st.palet.porteur.tient = false;
    Object.assign(s, { x: st.palet.x, y: st.palet.y, recupCd: 0 });
    s.x = window.faceOff.rink.cx + 60;
    s.y = window.faceOff.rink.cy - 40;
    st.palet.porteur = s;
    st.palet.dernier = s;
    s.tient = true;
    for (const o of st.patineurs) if (o !== s) Object.assign(o, { x: s.x - 120, y: s.y + 70, vx: 0, vy: 0 });
  });
  await attends(150);
  await I.keyboard.down('Space');
  await attends(350);
  const arme = await H.evaluate(() => window.faceOff.state.controles[1].arme);
  env.verifie(arme, 'ESPACE maintenue par l\'invité : tir en charge chez l\'hôte');
  await I.keyboard.up('Space');
  env.verifie(await env.attendsQue(H, () => window.faceOff.state.patineurs.some((s) => s.eq === 1 && s.tirT > 0), undefined, 1500), 'tir lâché : le geste de tir se joue chez l\'hôte');
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.patineurs.some((s) => s.eq === 1 && s.tirT > 0), undefined, 1500), 'et chez l\'invité');
  await env.capture(I, '2-tir');

  // 3) but : score et célébration identiques des deux côtés, puis reprise
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
  const scores = [await etat(H, () => [...window.faceOff.state.score]), await etat(I, () => [...window.faceOff.state.score])];
  env.verifie(scores[0][0] === 1 && scores[0].join() === scores[1].join(), `même score des deux côtés (${scores[0]} / ${scores[1]})`);
  await env.capture(I, '3-but');
  // le ralenti du but s'achève chez les deux (« passer »)
  await attends(300);
  await H.evaluate(() => window.faceOff.passeRalenti?.());
  await I.evaluate(() => window.faceOff.passeRalenti?.());
  await enJeu();
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.phase === 'jeu', undefined, 15000), 'reprise du jeu chez l\'invité');

  // 4) bonus en Wi-Fi : l'hôte tire un bonus, l'invité voit le tirage puis l'effet
  const donne = async (eq, id) => {
    await enJeu();
    await H.evaluate(([e, i]) => {
      const pv = window.faceOff.state.pouvoirs[e];
      Object.assign(pv, { actif: null, pret: i, tirage: 0 });
    }, [eq, id]);
    return env.attendsQue(I, ([e, i]) => window.faceOff.state.pouvoirs?.[e].actif === i, [eq, id], 4000);
  };
  env.verifie(await donne(0, 'envahissement'), 'ENVAHISSEMENT : l\'invité voit le bonus');
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.supporters.length === 5, undefined, 2000), 'les 5 supporters sont sur la glace chez l\'invité');
  await attends(700);
  await env.capture(I, '4a-envahissement');
  const sup = await etat(I, () => window.faceOff.state.supporters.map((s) => s.eq));
  env.verifie(sup.every((e) => e === 0), 'supporters aux couleurs de l\'équipe de l\'hôte');

  env.verifie(await donne(0, 'geante'), 'CAGE GEANTE : l\'invité voit le bonus');
  env.verifie((await etat(I, () => window.faceOff.state.pouvoirs[0].actif)) === 'geante', 'la cage géante est dans l\'état de l\'invité');
  await attends(300);
  await env.capture(I, '4b-cage-geante');

  env.verifie(await donne(0, 'givre'), 'GIVRE : l\'invité voit le bonus');
  await attends(900);
  await env.capture(I, '4c-givre');

  env.verifie(await donne(0, 'tremblement'), 'TREMBLEMENT : l\'invité voit le bonus');
  const secousse = await env.attendsQue(I, () => window.faceOff.effets.secousse > 1, undefined, 1500);
  env.verifie(secousse, 'l\'écran de l\'invité tremble aussi');

  // 5) loupé complet : l'invité (équipe 1) tire pendant le loupé de l'hôte → scène chez tous les deux
  env.verifie(await donne(0, 'loupe'), 'LOUPE COMPLET de l\'hôte : l\'invité voit le bonus');
  await H.evaluate(() => {
    const st = window.faceOff.state;
    const s = st.controles[1];
    if (st.palet.porteur) st.palet.porteur.tient = false;
    st.palet.porteur = s;
    st.palet.dernier = s;
    s.tient = true;
    s.recupCd = 0;
    for (const o of st.patineurs) if (o !== s) Object.assign(o, { x: s.x - 120, y: s.y + 70, vx: 0, vy: 0 });
  });
  await attends(150);
  await I.keyboard.down('Space');
  await attends(150);
  await I.keyboard.up('Space');
  env.verifie(await env.attendsQue(H, () => window.faceOff.state.phase === 'loupe', undefined, 1500), 'le tir de l\'invité déclenche le loupé chez l\'hôte');
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.phase === 'loupe', undefined, 1500), 'et chez l\'invité');
  await attends(1700);
  await env.capture(I, '5-loupe');
  env.verifie(await env.attendsQue(I, () => window.faceOff.state.phase !== 'loupe', undefined, 4000), 'la scène se termine chez l\'invité');
  env.verifie((await etat(H, () => window.faceOff.state.score)).join() === '1,0', 'le loupé ne compte aucun but');

  // 6) fin de match : mêmes résultats, puis revanche
  await enJeu();
  await lan.termineMatch(hote, [3, 2]);
  env.verifie(await env.attendsQue(I, () => window.faceOff.ecranUI === 'fin', undefined, 8000), 'fin du match chez l\'invité');
  env.verifie(await env.attendsQue(H, () => window.faceOff.ecranUI === 'fin', undefined, 8000), 'fin du match chez l\'hôte');
  const fin = [await etat(H, () => [...window.faceOff.state.score]), await etat(I, () => [...window.faceOff.state.score])];
  env.verifie(fin[0].join() === '3,2' && fin[1].join() === '3,2', `même score final (${fin[0]} / ${fin[1]})`);
  await attends(800);
  await env.capture(I, '6-fin');
}
