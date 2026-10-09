import { attends } from './outils.mjs';

/**
 * Le mode STATS des panneaux d'équipe : chaque moitié d'écran a son radar (on compare
 * deux équipes côte à côte), les flèches passent du patineur au joueur star, le bouton
 * EQUIPE revient à l'écusson (et aux flèches de changement d'équipe) ; en match, un seul
 * joueur star par équipe (celui du casque doré).
 */
export default async function stats(env) {
  const a = await env.appareil('S', { stockage: { mode: 'classique', niveau: 1, duree: 1, equipeJoueur: 'montpellier', bonus: false } });
  const p = a.page;
  for (const t of ['Escape', 'Enter']) {
    await p.keyboard.press(t);
    await attends(200);
  }
  await attends(600);
  const k = await p.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.width / window.faceOff.W, y: r.height / window.faceOff.H };
  });
  const clic = async (f, arg) => {
    const b = await p.evaluate(f, arg);
    await p.mouse.click(b.x * k.x, b.y * k.y);
    await attends(300);
  };
  const radars = () => p.evaluate(() => window.faceOff.radars.map((r) => (r ? (r.star ? 'star' : 'normal') : null)));
  // le bouton STATS / EQUIPE de chaque panneau (56 × 13), le plus à gauche puis le plus à droite
  const bouton = (i) => {
    const bs = window.faceOff.boutons.filter((x) => x.w === 56 && x.h === 13).sort((a, b) => a.x - b.x);
    return { x: bs[i].x + 28, y: bs[i].y + 6 };
  };
  // les flèches des radars : 20 × 20, deux par panneau
  const fleche = ([i]) => {
    const bs = window.faceOff.boutons.filter((x) => x.w === 20 && x.h === 20).sort((a, b) => a.x - b.x);
    return { x: bs[i].x + 10, y: bs[i].y + 10 };
  };
  env.verifie(JSON.stringify(await radars()) === '[null,null]', 'au départ, deux écussons');
  await env.capture(p, '1-choix');
  await clic(bouton, 0);
  await clic(bouton, 1);
  env.verifie(JSON.stringify(await radars()) === '["normal","normal"]', 'les deux moitiés montrent leur radar en même temps');
  // la flèche de droite du radar de gauche passe au joueur star ; l'autre radar ne bouge pas
  await clic(fleche, [1]);
  env.verifie(JSON.stringify(await radars()) === '["star","normal"]', 'la flèche passe au joueur star, dans la moitié concernée seulement');
  await env.capture(p, '2-cote-a-cote');
  await clic(fleche, [0]);
  env.verifie(JSON.stringify(await radars()) === '["normal","normal"]', 'et revient au patineur normal');
  // le clavier : gauche / droite pour la moitié de gauche, haut / bas pour celle de droite
  const avant = await p.evaluate(() => window.faceOff.pref.equipeJoueur);
  await p.keyboard.press('ArrowRight');
  await attends(200);
  await p.keyboard.press('ArrowDown');
  await attends(200);
  env.verifie(JSON.stringify(await radars()) === '["star","star"]', 'les flèches du clavier changent de profil, pas d\'équipe');
  env.verifie((await p.evaluate(() => window.faceOff.pref.equipeJoueur)) === avant, 'l\'équipe n\'a pas changé');
  await env.capture(p, '3-clavier');
  // le bouton EQUIPE revient à l'écusson : les flèches changent de nouveau l'équipe
  await clic(bouton, 0);
  env.verifie(JSON.stringify(await radars()) === '[null,"star"]', 'le bouton EQUIPE referme le radar de sa moitié');
  await p.keyboard.press('Escape');
  await attends(300);
  env.verifie(JSON.stringify(await radars()) === '[null,null]', 'ÉCHAP referme les radars');
  // en match : un seul joueur star par équipe
  await p.keyboard.press('Enter');
  await attends(400);
  await p.keyboard.press('Enter');
  await attends(400);
  await p.keyboard.press('Enter');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'jeu'), 'le match démarre');
  const rangs = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.rang === 0).map((s) => s.eq));
  env.verifie(rangs.length === 2 && rangs.includes(0) && rangs.includes(1), 'un joueur star par équipe');
  await env.capture(p, '4-match');
}
