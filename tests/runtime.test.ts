import { describe, expect, it } from 'vitest';
import { compileContext } from '../src/runtime/generation/compile-context';
import { isRoleplayFormattingStable, normalizeRoleplayReply } from '../src/runtime/generation/format';
import { resolveActiveCast } from '../src/runtime/generation/perception';
import { commitRelationshipEvent, getRelationship } from '../src/runtime/relationships/core';
import { importCharacterCard, importPersona } from '../src/runtime/schema/importers';
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
