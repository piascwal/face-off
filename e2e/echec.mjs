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

  // le joueur piloté, sans le palet, au milieu de la glace ; un adversaire juste devant lui.
  // L'ordinateur bouge entre la mise en place et la touche (machine lente) : on réessaie.
  const place = () =>
    p.evaluate(() => {
      const st = window.faceOff.state;
      const s = st.controles[0];
      const o = st.patineurs.find((x) => x.eq === 1 && x !== st.controles[1]);
      for (const x of st.patineurs) x.tient = false;
      st.palet.porteur = null;
      st.palet.x = 20;
      st.palet.y = 20;
      st.palet.vx = st.palet.vy = 0;
      Object.assign(s, { x: 200, y: 140, vx: 0, vy: 0, face: 0, elanT: 0, elanCd: 0, sonne: 0, arme: false });
      Object.assign(o, { x: 222, y: 140, vx: -30, vy: 0, sonne: 0, esquiveT: 0, prepaEchecT: 0, chuteT: 0 });
    });
  const checks = () => p.evaluate(() => window.faceOff.state.stats.checks[0]);
  const avant = await checks();
  let lance = 0;
  let touche_ = false;
  for (let essai = 0; essai < 4 && !touche_; essai++) {
    await place();
    await p.keyboard.down('KeyK');
    await attends(40);
    await p.keyboard.up('KeyK');
    lance = Math.max(lance, await p.evaluate(() => window.faceOff.state.controles[0].elanT));
    if (essai === 0 && lance > 0) await env.capture(p, '1-elan');
    touche_ = await env.attendsQue(p, (n) => window.faceOff.state.stats.checks[0] > n, avant, 800);
  }
  env.verifie(lance > 0 || touche_, `touche d'élan : l'élan démarre (elanT ${lance.toFixed(2)})`);
  env.verifie(touche_, 'le choc compte une mise en échec');
  await env.capture(p, '2-choc');
}
