import { COURTIERS } from '@piascwal/lan-kit';
import { describe, expect, it } from 'vitest';
import { ORIGINES_COURTIERS } from '../src/net/courtiers';

describe('politique de sécurité du site publié', () => {
  it('autorise exactement les serveurs de découverte de lan-kit', () => {
    // si lan-kit change ses serveurs, le Wi-Fi cesserait de marcher en ligne : ce test le dit
    const attendu = COURTIERS.map((u) => new URL(u).origin).sort();
    expect([...ORIGINES_COURTIERS].sort()).toEqual(attendu);
  });
});
