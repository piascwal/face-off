/**
 * Lance les tests de bout en bout : `npm run e2e` (tous) ou
 * `npm run e2e -- spectateur coupe` (certains). Code de sortie non nul au
 * moindre échec. Captures d'écran dans e2e/captures/.
 */
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environnement } from './outils.mjs';

const dossier = dirname(fileURLToPath(import.meta.url));
const tous = readdirSync(dossier)
  .filter((f) => f.endsWith('.mjs') && !['outils.mjs', 'lance.mjs'].includes(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();
const demandes = process.argv.slice(2);
const inconnus = demandes.filter((n) => !tous.includes(n));
if (inconnus.length) {
  console.error(`Tests inconnus : ${inconnus.join(', ')} (disponibles : ${tous.join(', ')})`);
  process.exit(2);
}

let total = 0;
for (const nom of demandes.length ? demandes : tous) {
  console.log(`\n▶ ${nom}`);
  const t0 = Date.now();
  const { default: test } = await import(`./${nom}.mjs`);
  const env = await environnement(nom);
  let echecs = 0;
  try {
    await test(env);
  } catch (e) {
    env.verifie(false, `exception : ${e?.stack ?? e}`);
  } finally {
    echecs = await env.fin();
  }
  total += echecs;
  console.log(`  ${echecs ? `${echecs} échec(s)` : 'réussi'} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(total ? `\n${total} échec(s)` : '\nTous les tests de bout en bout sont passés.');
process.exit(total ? 1 : 0);
