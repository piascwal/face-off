/**
 * Coupe de 16 équipes en solo : le mode COUPE 16 de l'accueil, huitièmes de
 * finale, quarts, demies et finale (4 tours) gagnés jusqu'au titre ; puis une
 * coupe où le joueur est éliminé dès les huitièmes (les 3 tours suivants se
 * simulent). Les fins de match sont forcées.
 */
import { attends } from './outils.mjs';

export default async function coupe16(env) {
  const a = await env.appareil('COUPE16', { stockage: { mode: 'classique', niveau: 0, duree: 0, equipeJoueur: 'chicago' } });
  const p = a.page;
  const app = (f, arg) => p.evaluate(f, arg);

  // le menu : CLASSIQUE -> COUPE 8 -> COUPE 16
  const mode = () => app(() => window.faceOff.pref.mode);
  env.verifie((await mode()) === 'classique', 'le menu démarre en CLASSIQUE');
  await app(() => window.faceOff.solo['menuProps']().onMode());
  env.verifie((await mode()) === 'coupe8', 'MODE : COUPE 8');
  await app(() => window.faceOff.solo['menuProps']().onMode());
  env.verifie((await mode()) === 'coupe16', 'MODE : COUPE 16');
  await env.capture(p, '1-menu');

  await app(() => window.faceOff.solo.jouer());
  env.verifie((await app(() => window.faceOff.ecranUI)) === 'coupeChoix', 'JOUER ouvre le choix de l\'équipe de la coupe 16');
  await env.capture(p, '2-choix');
  await app(() => window.faceOff.coupe.lance());
  await attends(500);
  const c0 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c0 && c0.taille === 16 && c0.equipe === 'chicago' && c0.tours.length === 4 && c0.tours[0].length === 8, 'coupe créée : 16 équipes, 8 matchs en huitièmes');
  env.verifie(new Set(c0.tours[0].flatMap((m) => [m.a, m.b])).size === 16, '16 équipes différentes');
  await env.capture(p, '3-tableau');

  const joueEtFinis = async (sj, sa) => {
    await app(() => window.faceOff.coupe.joueMatch());
    await attends(800);
    const ok = await app(() => window.faceOff.ecranUI === 'jeu' && window.faceOff.coupe.matchCoupe);
    await app((sc) => {
      const s = window.faceOff.state;
      s.score = sc;
      s.horloge = 0.01;
    }, [sj, sa]);
    await env.attendsQue(p, () => window.faceOff.ecranUI === 'fin');
    await app(() => window.faceOff.coupe.ouvreTableau());
    return ok;
  };

  env.verifie(await joueEtFinis(3, 1), 'le huitième se lance contre l\'adversaire du tableau');
  await attends(1500);
  const revele = await app(() => {
    const r = window.faceOff.coupe.revelation;
    return r && r.t0 !== null && r.etapes.length === 9;
  });
  env.verifie(revele, 'les résultats du tour se dévoilent (8 scores + tirage des quarts)');
  await env.capture(p, '4-devoilement');
  await app(() => window.faceOff.coupe.passeRevelation());
  await attends(400);
  const c1 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c1.tour === 1 && c1.tours[1].length === 4 && c1.tours[1][0].a === 'chicago', 'vainqueur en quart, tableau sauvegardé');
  await env.capture(p, '5-quarts');

  for (let t = 1; t < 4; t++) {
    await joueEtFinis(4, 2);
    await app(() => window.faceOff.coupe.passeRevelation());
    await attends(300);
  }
  const c2 = await app(() => window.faceOff.pref.coupe);
  env.verifie(!c2.elimine && c2.tour === 4 && c2.tours[3][0].sa === 4, 'quatre victoires : champion');
  await env.capture(p, '6-champion');
  await app(() => window.faceOff.coupe.quitteTableau());
  env.verifie((await app(() => window.faceOff.pref.coupe)) === null, 'la coupe terminée est rangée');

  // éliminé dès les huitièmes : les trois tours suivants se jouent en simulation
  await app(() => window.faceOff.coupe.nouvelle());
  await app(() => window.faceOff.coupe.lance());
  await joueEtFinis(0, 3);
  await app(() => window.faceOff.coupe.passeRevelation());
  await attends(400);
  const c3 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c3.elimine && c3.tour === 4 && c3.tours.map((l) => l.length).join() === '8,4,2,1' && c3.tours[3][0].sa !== null, 'éliminé en huitièmes : quarts, demies et finale simulés');
  await env.capture(p, '7-elimine');

  // une coupe de 8 en cours se reprend telle quelle, même si le menu est sur COUPE 16
  await app(() => window.faceOff.coupe.nouvelle());
  await app(() => window.faceOff.coupe.lance());
  env.verifie((await app(() => window.faceOff.pref.coupe.taille)) === 16, 'la nouvelle coupe prend la taille du mode (16)');
}
