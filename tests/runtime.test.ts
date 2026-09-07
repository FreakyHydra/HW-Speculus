import { describe, expect, it } from 'vitest';
import { compileContext } from '../src/runtime/generation/compile-context';
import { isRoleplayFormattingStable, normalizeRoleplayReply } from '../src/runtime/generation/format';
import { resolveActiveCast } from '../src/runtime/generation/perception';
import { commitRelationshipEvent, getRelationship } from '../src/runtime/relationships/core';
import { importCharacterCard, importPersona } from '../src/runtime/schema/importers';
import type { ClientLaunchPackage } from '../src/runtime/schema/types';
import { character, persona } from './fixtures';

describe('runtime foundations', () => {
  it('compiles character, persona, and scene into context', () => {
    const relationship = getRelationship({}, character.id, persona.id);
    const compiled = compileContext({ character, persona, scene: 'Inside the test vault.', transcript: [], relationship });
    expect(compiled.prompt).toContain('Peony');
    expect(compiled.prompt).toContain('Skyler');
    expect(compiled.prompt).toContain('Inside the test vault.');
    expect(compiled.manifest.includedSections).toContain('persona');
  });

  it('anchors Orbis context to the immutable SPC registry identity', () => {
    const relationship = getRelationship({}, character.id, persona.id);
    const launchPackage: ClientLaunchPackage = {
      version: 1,
      launchId: 'launch-runtime-registry',
      issuedAt: 1,
      expiresAt: 2,
      catalog: {
        code: 'SPC-C-KD41827', prefix: 'C', plate: 'KD41827', generation: 1,
        registryNumber: 27, classRegistryNumber: 2, classification: 'CHARACTER',
        createdAt: '2026-09-08T00:00:00.000Z', status: 'active',
      },
      primaryAsset: { id: character.id, revision: 'rev-1', type: 'character', name: character.name, summary: character.description, data: {} },
      relatedAssets: [],
      character,
      persona,
      scene: 'Inside the test vault.',
      contextBlocks: [],
      relationshipState: {},
      model: 'xialong-v1',
    };
    const compiled = compileContext({ character, persona, scene: launchPackage.scene, transcript: [], relationship, launchPackage });
    expect(compiled.manifest.includedSections).toContain('registry');
    expect(compiled.prompt).toContain('Canonical Speculus identity: SPC-C-KD41827');
    expect(compiled.prompt).toContain('Internal global registry sequence: 27');
    expect(compiled.prompt).toContain('Internal character sequence: 2');
    expect(compiled.prompt).toContain('not in-world knowledge');
  });

  it('keeps character and persona schemas distinct', () => {
    expect(character.kind).toBe('character');
    expect(persona.kind).toBe('persona');
    expect(() => importPersona({ spec: 'chara_card_v2', data: { name: 'Wrong' } })).toThrow(/character card, not a persona/i);
    expect(() => importPersona(character)).toThrow(/character card, not a persona/i);
    expect(() => importCharacterCard({ name: 'Wrong direction' })).toThrow(/not a Character Card V2/i);
  });

  it('resolves only the loaded subject as active', () => {
    const result = resolveActiveCast(character, 'Peony turns when Rowan knocks.');
    expect(result.active).toEqual([{ id: character.id, name: 'Peony', reason: 'loaded primary subject' }]);
    expect(result.mentionedOnly).toContain('Rowan');
  });

  it('preserves stable roleplay formatting', () => {
    const source = '*Peony taps the gauge.* "Steady now." [I hope it holds.]';
    expect(normalizeRoleplayReply(source)).toBe(source);
    expect(isRoleplayFormattingStable(source)).toBe(true);
    expect(normalizeRoleplayReply('Hello there.')).toBe('"Hello there."');
  });

  it('keys and replaces relationship events by stable turn ID', () => {
    const base = { characterId: character.id, personaId: persona.id, turnId: 'turn:1:character', reason: 'test', dimensionDeltas: { trust: 2 }, createdAt: 1 } as const;
    const first = commitRelationshipEvent({}, { ...base, delta: 4 });
    const replaced = commitRelationshipEvent(first, { ...base, delta: 9, createdAt: 2 });
    const record = getRelationship(replaced, character.id, persona.id);
    expect(record.events).toHaveLength(1);
    expect(record.events[0].turnId).toBe('turn:1:character');
    expect(record.score).toBe(9);
  });
});
