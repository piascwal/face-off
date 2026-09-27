/**
 * Outils communs des tests de bout en bout (navigateur) : un serveur Vite de
 * développement, un courtier MQTT local (la découverte des parties Wi-Fi
 * passe par lui au lieu des serveurs publics) et Chromium piloté par
 * Playwright. Chaque « appareil » est un contexte de navigateur séparé
 * (stockage local à part), l'application est exposée en `window.faceOff`
 * (mode développement, voir src/main.ts).
 */
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Aedes from 'aedes';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createWebSocketStream, WebSocketServer } from 'ws';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Captures d'écran des tests (ignorées par git). */
export const CAPTURES = join(RACINE, 'e2e', 'captures');

export const attends = (ms) => new Promise((r) => setTimeout(r, ms));

/** Courtier MQTT sur WebSocket, sur un port libre. */
async function demarreCourtier() {
  const aedes = Aedes();
  const serveur = http.createServer();
  const wss = new WebSocketServer({ server: serveur, handleProtocols: (p) => (p.has('mqtt') ? 'mqtt' : false) });
  wss.on('connection', (ws) => aedes.handle(createWebSocketStream(ws)));
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  return {
    url: `ws://127.0.0.1:${serveur.address().port}`,
    arrete: async () => {
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => serveur.close(r));
      await new Promise((r) => aedes.close(r));
    },
  };
}

/**
 * Environnement d'un test : serveurs + navigateur. `appareil(nom)` ouvre un
 * nouvel appareil (téléphone en paysage) sur le jeu ; `verifie` compte les
 * échecs, et `fin()` ferme tout et renvoie le nombre d'échecs.
 */
export async function environnement(nomTest) {
  mkdirSync(CAPTURES, { recursive: true });
  const vite = await createServer({ root: RACINE, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await vite.listen();
  const courtier = await demarreCourtier();
  const adresse = vite.httpServer.address();
  const base = `http://127.0.0.1:${adresse.port}/`;
  // la découverte Wi-Fi passe par le courtier local, sur un canal propre à ce test
  const urlJeu = `${base}?reseau=${encodeURIComponent(nomTest)}-${Date.now()}&courtier=${encodeURIComponent(courtier.url)}`;
  // sans ce drapeau, Chromium masque les adresses locales derrière du mDNS et WebRTC ne se connecte pas
  const navigateur = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  let echecs = 0;
  const erreursPage = [];

  const env = {
    urlJeu,
    navigateur,
    /** Ouvre un appareil ; `options` : viewport, dpr, stockage local initial, pseudo. */
    async appareil(nom, options = {}) {
      const { largeur = 844, hauteur = 390, dpr = 2, stockage = null, pseudo = null } = options;
      const contexte = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
      if (stockage) await contexte.addInitScript((s) => localStorage.setItem('face-off-v1', s), JSON.stringify(stockage));
      const page = await contexte.newPage();
      page.on('pageerror', (e) => {
        erreursPage.push(`${nom} : ${e.message}`);
        console.log(`  [${nom}] ERREUR PAGE ${e.message}`);
      });
      page.on('console', (m) => {
        if (m.type() === 'error') console.log(`  [${nom}] console : ${m.text()}`);
      });
      await page.goto(urlJeu);
      await page.waitForFunction(() => !!window.faceOff);
      await attends(800);
      if (pseudo) await page.evaluate((p) => (window.faceOff.pref.pseudo = p), pseudo);
      return { nom, page, contexte };
    },
    /** Attend qu'une condition (évaluée dans la page) devienne vraie. */
    async attendsQue(page, f, arg, ms = 10000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.evaluate(f, arg)) return true;
        await attends(120);
      }
      return false;
    },
    verifie(ok, msg) {
      if (!ok) echecs++;
      console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${msg}`);
      return ok;
    },
    async capture(page, nom) {
      await page.screenshot({ path: join(CAPTURES, `${nomTest}-${nom}.png`) });
    },
    async fin() {
      if (erreursPage.length) env.verifie(false, `aucune erreur JavaScript dans les pages (${erreursPage.length})`);
      await navigateur.close();
      await courtier.arrete();
      await vite.close();
      return echecs;
    },
  };
  return env;
}

// ------------------------------------------------------------ Wi-Fi --

/** Actions de l'application, raccourcis pour les tests Wi-Fi. */
export const lan = {
  /** L'hôte ouvre une partie ; l'invité la voit dans la liste et la rejoint. */
  async connecte(env, hote, invite) {
    await hote.page.evaluate(() => {
      window.faceOff.ouvreConfigLan();
      window.faceOff.creePartieLan();
    });
    await env.attendsQue(hote.page, () => !!window.faceOff.hote);
    await invite.page.evaluate(() => window.faceOff.ouvreLan());
    env.verifie(await env.attendsQue(invite.page, () => (window.faceOff.client?.parties.length ?? 0) > 0), 'l\'invité voit la partie dans la liste');
    await invite.page.evaluate(() => window.faceOff.rejoinsLan(window.faceOff.client.parties[0]));
    return env.verifie(await env.attendsQue(hote.page, () => !!window.faceOff.hote?.partie.joueurs[1]), 'l\'invité est connecté à l\'hôte');
  },
  /** Du salon au match : l'hôte lance, les deux valident équipes puis maillots. */
  async lanceMatch(env, hote, invite) {
    await hote.page.evaluate(() => window.faceOff.agitLan({ a: 'lancer' }));
    await attends(500);
    for (let etape = 0; etape < 2; etape++) {
      await hote.page.evaluate(() => window.faceOff.agitLan({ a: 'pret', pret: true }));
      await invite.page.evaluate(() => window.faceOff.agitLan({ a: 'pret', pret: true }));
      await attends(700);
    }
    return env.verifie(await env.attendsQue(invite.page, () => window.faceOff.ecranUI === 'jeu'), 'le match démarre chez l\'invité');
  },
  /** Force la fin du match côté hôte (score donné). */
  async termineMatch(hote, score) {
    await hote.page.evaluate((sc) => {
      const s = window.faceOff.state;
      s.score = sc;
      s.horloge = 0.05;
    }, score);
  },
};
