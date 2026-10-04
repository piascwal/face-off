import { describe, expect, it, vi } from 'vitest';
import { lisVersionPubliee, MiseAJour } from '@app/mise-a-jour';

describe('proposition de mise à jour', () => {
  it('rien ne s’affiche tant qu’aucune version n’est prête', () => {
    const m = new MiseAJour();
    expect(m.proposee).toBe(false);
    expect(m.refusee).toBe(false);
  });

  it('une nouvelle version est proposée, et seulement installée si le joueur accepte', () => {
    const installe = vi.fn();
    const m = new MiseAJour();
    m.signale(installe, 'V1.2.3');
    expect(m.proposee).toBe(true);
    expect(m.version).toBe('V1.2.3');
    expect(installe).not.toHaveBeenCalled();
    m.accepte();
    expect(installe).toHaveBeenCalledOnce();
  });

  it('« plus tard » ne bloque rien, ne réinstalle pas et laisse un rappel ; le rappel rouvre la proposition', () => {
    const installe = vi.fn();
    const m = new MiseAJour();
    m.signale(installe);
    m.plusTard();
    expect(m.proposee).toBe(false);
    expect(m.refusee).toBe(true);
    expect(installe).not.toHaveBeenCalled();
    // le service worker signale encore la même version : on n'insiste pas
    m.signale(installe);
    expect(m.proposee).toBe(false);
    m.rouvre();
    expect(m.proposee).toBe(true);
  });

  it('ignore une version illisible ou piégée : l’écran reste générique', () => {
    const m = new MiseAJour();
    m.signale(() => {}, '<script>alert(1)</script>');
    expect(m.version).toBeNull();
    expect(m.proposee).toBe(true);
  });
});

describe('lecture de la version publiée', () => {
  const reponse = (corps: unknown, ok = true) => ({ ok, json: async () => corps }) as Response;

  it('lit version.json sans cache', async () => {
    const chercher = vi.fn(async () => reponse({ version: 'V0.13.0+42' }));
    expect(await lisVersionPubliee('/face-off/', chercher as unknown as typeof fetch)).toBe('V0.13.0+42');
    const [url, options] = chercher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/face-off\/version\.json\?\d+$/);
    expect(options.cache).toBe('no-store');
  });

  it('hors ligne, en erreur ou illisible : null, sans lever d’exception', async () => {
    const hors = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await lisVersionPubliee('/', hors as unknown as typeof fetch)).toBeNull();
    expect(
      await lisVersionPubliee('/', (async () => reponse({}, false)) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await lisVersionPubliee('/', (async () => reponse({ version: 12 })) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await lisVersionPubliee('/', (async () => reponse({ version: 'pirate' })) as unknown as typeof fetch),
    ).toBeNull();
  });

  it('abandonne au bout du délai', async () => {
    const lent = ((_u: string, o: RequestInit) =>
      new Promise((_ok, ko) =>
        o.signal?.addEventListener('abort', () => ko(new Error('abort'))),
      )) as unknown as typeof fetch;
    expect(await lisVersionPubliee('/', lent, 20)).toBeNull();
  });
});
