/**
 * Mode coupe en solo : choix du mode, de l'équipe, tableau, un quart gagné
 * (résultats dévoilés un à un), une demie perdue (fin de coupe simulée), puis
 * une coupe gagnée jusqu'au titre. Les fins de match sont forcées.
 */
import { attends } from './outils.mjs';

export default async function coupe(env) {
  const a = await env.appareil('SOLO', { stockage: { mode: 'coupe', niveau: 0, duree: 0, equipeJoueur: 'roanne' } });
  const p = a.page;
  const app = (f, arg) => p.evaluate(f, arg);
  await env.capture(p, '1-menu');
  await app(() => window.faceOff.solo.jouer());
  env.verifie((await app(() => window.faceOff.ecranUI)) === 'coupeChoix', 'JOUER en mode coupe ouvre le choix de l\'équipe');
  await app(() => window.faceOff.coupe.lance());
  await attends(500);
  const c0 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c0 && c0.equipe === 'roanne' && c0.tours[0].length === 4, 'coupe créée : 8 équipes, le joueur dans le premier quart');
  await env.capture(p, '2-tableau');

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

  env.verifie(await joueEtFinis(3, 1), 'le quart se lance contre l\'adversaire du tableau');
  await attends(1200);
  const revele = await app(() => {
    const r = window.faceOff.coupe.revelation;
    return r && r.t0 !== null && r.etapes.length === 5;
  });
  env.verifie(revele, 'les résultats du tour se dévoilent (4 scores + tirage des demies)');
  await env.capture(p, '3-devoilement');
  await attends(3500);
  const c1 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c1.tour === 1 && c1.tours[1].length === 2 && c1.tours[1][0].a === 'roanne', 'vainqueur en demie, tableau sauvegardé');
  const niv = await app(() => window.faceOff.solo.niveauMatch);

  await joueEtFinis(1, 2);
  env.verifie(niv === 0, 'le quart se joue au niveau choisi');
  await attends(6000);
  const c2 = await app(() => window.faceOff.pref.coupe);
  env.verifie(c2.elimine && c2.tour === 3 && c2.tours[2][0].sa !== null, 'éliminé : la fin de la coupe est simulée');
  await env.capture(p, '4-elimine');

  await app(() => {
    window.faceOff.coupe.nouvelle();
    window.faceOff.coupe.lance();
  });
  for (let t = 0; t < 3; t++) {
    await joueEtFinis(4, 2);
    await app(() => window.faceOff.coupe.passeRevelation());
  }
  await attends(500);
  const c3 = await app(() => window.faceOff.pref.coupe);
  env.verifie(!c3.elimine && c3.tour === 3 && c3.tours[2][0].sa === 4, 'trois victoires : champion');
  await env.capture(p, '5-champion');
  await app(() => window.faceOff.coupe.quitteTableau());
  env.verifie((await app(() => window.faceOff.pref.coupe)) === null, 'la coupe terminée est rangée en quittant le tableau');
}
