import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EQUIPES_JOUABLES as PROFILS, trouveEquipe } from '../src/core/teams';
import { EQUIPES_JOUABLES as VISUELS, trouveTeamDef } from '../src/render/team-visuals';

const racine = new URL('../', import.meta.url);
const fichier = (chemin: string) => new URL(chemin, racine);

describe('équipes jouables', () => {
  it('les profils de jeu et les visuels listent les mêmes équipes, dans le même ordre', () => {
    expect(VISUELS.map((e) => e.id)).toEqual(PROFILS.map((e) => e.id));
  });

  it('chaque équipe a son écusson et ses sprites, domicile et extérieur', () => {
    const meta = JSON.parse(readFileSync(fichier('public/sprites/meta.json'), 'utf8'));
    for (const e of VISUELS) {
      expect(existsSync(fichier(`public/${e.logo}`)), e.logo).toBe(true);
      expect(meta.teamIds).toContain(e.id);
      for (const v of ['interieur', 'exterieur'])
        for (const s of ['skater', 'goalie', 'portrait', 'celebration'])
          expect(existsSync(fichier(`public/sprites/${s}-${e.id}-${v}.png`)), `${s}-${e.id}-${v}`).toBe(true);
    }
  });

  it('Castres Hockey Club est jouable', () => {
    const def = trouveTeamDef('castres');
    expect(def.id).toBe('castres');
    expect(def.ville).toBe('Castres');
    expect(def.interieur.maillot).toBe('#16105a');
    expect(def.exterieur.maillot).toBe('#ffffff');
    expect(trouveEquipe('castres').id).toBe('castres');
  });
});
