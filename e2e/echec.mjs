/**
 * Mise en échec : la touche d'élan (sans le palet) lance le coup d'épaule —
 * l'élan démarre, la pose dédiée s'affiche (capture), puis le choc contre un
 * adversaire placé sur la trajectoire (secousse, ondes d'impact).
 */
import { attends } from './outils.mjs';

export default async function echec(env) {
  const a = await env.appareil('ECHEC', { stockage: { mode: 'classique', niveau: 1, duree: 1, equipeJoueur: 'nice', bonus: false } });
  const p = a.page;
  const touche = async (t) => {
    await p.keyboard.press(t);
    await attends(150);
  };
  await touche('Escape');
  await touche('Enter');
  await touche('Enter');
  await touche('Enter');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'jeu' && !window.faceOff.ralenti.actif), 'engagement joué');

  // le joueur piloté, sans le palet, au milieu de la glace ; un adversaire à 30 px devant lui
  await p.evaluate(() => {
    const st = window.faceOff.state;
    const s = st.controles[0];
    const o = st.patineurs.find((x) => x.eq === 1 && x !== st.controles[1]);
    if (st.palet.tenu) st.palet.tenu.tient = false;
    for (const x of st.patineurs) x.tient = false;
    st.palet.x = 20;
    st.palet.y = 20;
    st.palet.vx = st.palet.vy = 0;
    Object.assign(s, { x: 200, y: 140, vx: 0, vy: 0, face: 0, elanCd: 0, sonne: 0, tient: false, arme: false });
    Object.assign(o, { x: 232, y: 140, vx: 0, vy: 0, sonne: 0, tient: false, esquiveT: 0, prepaEchecT: 0 });
    window.__cible = o.rang;
  });
  const avant = await p.evaluate(() => window.faceOff.state.stats.checks[0]);
  await p.keyboard.down('KeyK');
  await attends(60);
  await p.keyboard.up('KeyK');
  const lance = await p.evaluate(() => window.faceOff.state.controles[0].elanT);
  env.verifie(lance > 0 || (await p.evaluate(() => window.faceOff.state.stats.checks[0])) > avant, `touche d'élan : l'élan démarre (elanT ${lance.toFixed(2)})`);
  if (lance > 0) await env.capture(p, '1-elan');
  env.verifie(await env.attendsQue(p, (n) => window.faceOff.state.stats.checks[0] > n, avant, 1500), 'le choc compte une mise en échec');
  await env.capture(p, '2-choc');
}
