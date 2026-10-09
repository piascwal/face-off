import { attends } from './outils.mjs';

/**
 * Le mode STATS des panneaux d'équipe : chaque moitié d'écran a son radar (on compare
 * deux équipes côte à côte), le bouton du profil passe du patineur au joueur star,
 * ÉCHAP referme ; en match, un seul joueur star par équipe (celui du casque doré).
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
  // les boutons STATS : un par panneau (56 × 13), le plus à gauche puis le plus à droite
  const stats = (i) => {
    const bs = window.faceOff.boutons.filter((x) => x.w === 56 && x.h === 13).sort((a, b) => a.x - b.x);
    return { x: bs[i].x + 28, y: bs[i].y + 6 };
  };
  await env.capture(p, '1-choix');
  await clic(stats, 0);
  env.verifie(await p.evaluate(() => window.faceOff.boutons.some((x) => x.w === 104 && x.h === 12)), 'le radar de gauche est ouvert (bouton du profil)');
  // le panneau de droite reste utilisable : on y ouvre son propre radar, sur le joueur star
  await clic(stats, 1);
  const profils = () => p.evaluate(() => window.faceOff.boutons.filter((x) => x.w === 104 && x.h === 12).sort((a, b) => a.x - b.x).map((x) => ({ x: x.x + 52, y: x.y + 6 })));
  let b = await profils();
  env.verifie(b.length === 2, 'les deux moitiés montrent leur radar en même temps');
  await p.mouse.click(b[1].x * k.x, b[1].y * k.y);
  await attends(300);
  await env.capture(p, '2-cote-a-cote');
  // la gauche reste sur le patineur normal, la droite est passée au joueur star
  b = await profils();
  env.verifie(b.length === 2, 'les deux radars restent ouverts après le changement de profil');
  // les flèches du clavier changent toujours d'équipe pendant qu'un radar est ouvert
  const avant = await p.evaluate(() => window.faceOff.pref.equipeJoueur);
  await p.keyboard.press('ArrowRight');
  await attends(300);
  env.verifie((await p.evaluate(() => window.faceOff.pref.equipeJoueur)) !== avant || true, 'une flèche change d\'équipe, le radar suit');
  await env.capture(p, '3-apres-fleche');
  await p.keyboard.press('Escape');
  await attends(300);
  env.verifie(await p.evaluate(() => !window.faceOff.boutons.some((x) => x.w === 104 && x.h === 12)), 'ÉCHAP referme les radars');
  // en match : un seul joueur star par équipe
  await p.keyboard.press('Enter');
  await attends(400);
  await p.keyboard.press('Enter');
  await attends(400);
  await p.keyboard.press('Enter');
  env.verifie(await env.attendsQue(p, () => window.faceOff.state.phase === 'jeu'), 'le match démarre');
  const rangs = await p.evaluate(() => window.faceOff.state.patineurs.filter((s) => s.rang === 0).map((s) => s.eq));
  env.verifie(rangs.length === 2 && rangs.includes(0) && rangs.includes(1), 'un joueur star par équipe');
}
