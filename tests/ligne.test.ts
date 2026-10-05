import { describe, expect, it } from 'vitest';
import { ouvreReseau } from '../src/net/canal';
import { lisCtrl } from '../src/net/protocole';

describe('jeu en ligne', () => {
  it('un salon en ligne a son propre salon chiffré, un code invalide est refusé', async () => {
    const r = await ouvreReseau({ type: 'ligne', code: 'KYNX-4K7P' });
    expect(r.enLigne).toBe(true);
    expect(r.salons).toHaveLength(1);
    expect(r.salons[0]!.base).toMatch(/^face-off\/v\d+\/ligne\//);
    await expect(ouvreReseau({ type: 'ligne', code: 'nimporte' })).rejects.toThrow('code');
  });

  it('valide le message des pings : quatre sièges, des durées bornées ou rien', () => {
    expect(lisCtrl({ t: 'pings', p: [null, 42, null, 0] })).toEqual({ t: 'pings', p: [null, 42, null, 0] });
    for (const p of [[1, 2, 3], [null, -1, null, null], [null, 1.5, null, null], [null, 99999, null, null], 'x']) {
      expect(lisCtrl({ t: 'pings', p }), JSON.stringify(p)).toBeNull();
    }
  });
});
