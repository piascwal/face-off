/**
 * Parcours solo au clavier, comme un joueur : menu, choix des équipes et des
 * maillots (avec retour arrière), match, pause et reprise, fin de match
 * (image puis statistiques), rejouer, le bilan des victoires et l'aide des
 * commandes (réglages avancés).
 */
import { attends } from './outils.mjs';

export default async function solo(env) {
  const a = await env.appareil('SOLO', { stockage: { mode: 'classique', niveau: 1, duree: 0, equipeJoueur: 'nice' } });
  const p = a.page;
  const ecran = () => p.evaluate(() => window.faceOff.ecranUI);
  const touche = async (t) => {
    await p.keyboard.press(t);
    await attends(150);
  };
  await env.capture(p, '0-demarrage');
  env.verifie(await p.evaluate(() => window.faceOff.attenteDemarrage), 'écran de démarrage affiché avant tout geste');

  // premier geste : passe l'écran de démarrage (plein écran), n'active aucun bouton du menu
  await touche('Escape');
  env.verifie(!(await p.evaluate(() => window.faceOff.attenteDemarrage)), 'ÉCHAP : écran de démarrage passé');
  env.verifie((await ecran()) === 'menu', 'toujours sur le menu (aucun bouton atteint par ce premier geste)');
  await env.capture(p, '1-menu');

  await touche('Enter');
  env.verifie((await ecran()) === 'equipes', 'ENTRÉE au menu : choix des équipes');
  await touche('ArrowRight');
  await touche('ArrowDown');
  const choix = await p.evaluate(() => [window.faceOff.solo.indexJoueur, window.faceOff.solo.indexAdversaire]);
  env.verifie(choix[0] === 2, `flèche droite : équipe suivante (index ${choix[0]})`);
  await env.capture(p, '2-equipes');
  await touche('Enter');
  env.verifie((await ecran()) === 'maillots', 'ENTRÉE : choix des maillots');
  await touche('Escape');
  env.verifie((await ecran()) === 'equipes', 'ÉCHAP : retour au choix des équipes');
  await touche('Enter');
  await touche('ArrowLeft');
  env.verifie((await p.evaluate(() => window.faceOff.solo.varianteJoueur)) === 'exterieur', 'flèche gauche : maillot extérieur');
  await env.capture(p, '3-maillots');
  await touche('Enter');
  env.verifie((await ecran()) === 'jeu', 'ENTRÉE : le match commence');
  env.verifie((await p.evaluate(() => window.faceOff.equipesActuelles[0].id)) === 'vaujany-exterieur', 'équipe et maillot choisis appliqués');
  // le joueur piloté est bien connu de l'affichage : commandes tactiles, jauge et trait de visée en dépendent
  env.verifie(
    await p.evaluate(() => !!window.faceOff.state.controles[0] && window.faceOff.lan.pilote(window.faceOff.state) === window.faceOff.state.controles[0]),
    'le patineur piloté est celui du joueur (commandes, jauge de tir, visée)',
  );
  await env.capture(p, '3b-match-commandes');

  // pause et reprise
  await attends(2000);
  await touche('Escape');
  env.verifie((await ecran()) === 'pause', 'ÉCHAP en match : pause');
  const t0 = await p.evaluate(() => window.faceOff.state.temps);
  await attends(600);
  const t1 = await p.evaluate(() => window.faceOff.state.temps);
  env.verifie(t0 === t1, 'le match est figé pendant la pause');
  await env.capture(p, '4-pause');
  await touche('Enter');
  env.verifie((await ecran()) === 'jeu', 'ENTRÉE : reprise');
  await attends(400);
  env.verifie((await p.evaluate(() => window.faceOff.state.temps)) > t1, 'le match reprend');

  // fin de match : image, puis statistiques, puis rejouer
  const avant = await p.evaluate(() => window.faceOff.pref.victoires[1] ?? 0);
  await p.evaluate(() => {
    const s = window.faceOff.state;
    s.score = [3, 1];
    s.horloge = 0.01;
  });
  env.verifie(await env.attendsQue(p, () => window.faceOff.ecranUI === 'fin'), 'fin du match');
  env.verifie(await p.evaluate(() => window.faceOff.imageFin.seule()), 'image de victoire seule à l\'écran');
  await env.capture(p, '5-victoire');
  env.verifie((await p.evaluate(() => window.faceOff.pref.victoires[1] ?? 0)) === avant + 1, 'victoire comptée au niveau NORMAL');
  await touche('Enter');
  env.verifie(!(await p.evaluate(() => window.faceOff.imageFin.seule())), 'ENTRÉE : les statistiques s\'affichent');
  await env.capture(p, '6-stats');
  await touche('Enter');
  env.verifie((await ecran()) === 'jeu', 'ENTRÉE : on rejoue avec les mêmes équipes');
  env.verifie((await p.evaluate(() => window.faceOff.equipesActuelles[0].id)) === 'vaujany-exterieur', 'mêmes équipes et maillots');

  // retour au menu depuis la pause
  await attends(500);
  await touche('Escape');
  await p.evaluate(() => window.faceOff.retourMenu());
  env.verifie((await ecran()) === 'menu', 'retour au menu');

  // réglages avancés > commandes : onglets tactile / clavier, retours en arrière
  await p.evaluate(() => (window.faceOff.ecranUI = 'avance'));
  await p.evaluate(() => window.faceOff.solo.ouvreCommandes());
  env.verifie((await ecran()) === 'commandes', 'écran des commandes');
  const onglet = () => p.evaluate(() => window.faceOff.solo.ongletCommandes);
  const o1 = await onglet();
  await env.capture(p, `7-commandes-${o1}`);
  await touche('ArrowRight');
  const o2 = await onglet();
  env.verifie(o1 !== o2, `flèche : onglet ${o1} -> ${o2}`);
  await env.capture(p, `8-commandes-${o2}`);
  await touche('Escape');
  env.verifie((await ecran()) === 'avance', 'ÉCHAP : retour aux réglages avancés');
  await touche('Escape');
  env.verifie((await ecran()) === 'menu', 'ÉCHAP : retour au menu');
}
