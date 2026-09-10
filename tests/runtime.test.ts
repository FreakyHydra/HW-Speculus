import { describe, expect, it } from 'vitest';
import { compileContext } from '../src/runtime/generation/compile-context';
import { containsInternalContextLeak, isRoleplayFormattingStable, normalizeRoleplayReply, redactPrivatePlayerKnowledge, stripModelControlTokens } from '../src/runtime/generation/format';
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

  it('keeps internal Orbis registry and raw asset metadata out of model context', () => {
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
      primaryAsset: {
        id: character.id,
        revision: 'rev-secret',
        type: 'character',
        name: character.name,
        summary: character.description,
        data: { internalSecret: 'do-not-send-to-model' },
      },
      relatedAssets: [],
      character,
      persona,
      scene: 'Inside the test vault.',
      contextBlocks: [{ id: 'canon-1', title: 'Canon', content: 'The vault door is visibly shut.' }],
      relationshipState: {},
      model: 'xialong-v1',
    };
    const compiled = compileContext({ character, persona, scene: launchPackage.scene, transcript: [], relationship, launchPackage });
    expect(compiled.manifest.includedSections).toContain('orbis-asset');
    expect(compiled.manifest.includedSections).not.toContain('registry');
    expect(compiled.prompt).toContain('The vault door is visibly shut.');
    expect(compiled.prompt).not.toContain('SPC-C-KD41827');
    expect(compiled.prompt).not.toContain('rev-secret');
    expect(compiled.prompt).not.toContain('do-not-send-to-model');
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

  it('removes private player narration before it reaches model history', () => {
    const relationship = getRelationship({}, character.id, persona.id);
    const playerText = '*I stop at the fence.* [Pip does not know my real name is Rowan.] "Can I pass?" I secretly expect her to refuse.';
    expect(redactPrivatePlayerKnowledge(playerText)).toBe('*I stop at the fence.* "Can I pass?"');

    const compiled = compileContext({
      character,
      persona,
      scene: 'At the boundary fence.',
      relationship,
      transcript: [{
        id: 'turn:1:player',
        turnId: 'turn:1',
        sender: 'player',
        speaker: persona.name,
        text: playerText,
        timestamp: 1,
      }],
    });
    const history = compiled.prompt.match(/<history>\n([\s\S]*?)\n<\/history>/)?.[1] ?? '';
    expect(history).toContain('*I stop at the fence.* "Can I pass?"');
    expect(history).not.toContain('real name is Rowan');
    expect(history).not.toContain('secretly expect');
  });

  it('removes cognition embedded inside outward action spans', () => {
    expect(redactPrivatePlayerKnowledge('*I glance toward the road, wondering whether Pip followed me.* "Hello?"'))
      .toBe('*I glance toward the road* "Hello?"');
  });

  it('preserves stable roleplay formatting', () => {
    const source = '*Peony taps the gauge.* "Steady now." [I hope it holds.]';
    expect(normalizeRoleplayReply(source)).toBe(source);
    expect(isRoleplayFormattingStable(source)).toBe(true);
    expect(normalizeRoleplayReply('Hello there.')).toBe('"Hello there."');
  });

  it('blocks provider replies that echo internal Speculus context', () => {
    const leaked = '<character>\nName: Peony\nCard system prompt: secret\n</character>';
    expect(containsInternalContextLeak(leaked)).toBe(true);
    expect(() => normalizeRoleplayReply(leaked)).toThrow(/internal Speculus context.*blocked/i);
  });

  it('strips provider control tags before storage and history compilation', () => {
    const dirty = '*Peony checks the gauge.* "Steady."\n</assistant>';
    expect(stripModelControlTokens(dirty)).toBe('*Peony checks the gauge.* "Steady."\n');
    expect(normalizeRoleplayReply(dirty)).toBe('*Peony checks the gauge.* "Steady."');

    const relationship = getRelationship({}, character.id, persona.id);
    const compiled = compileContext({
      character,
      persona,
      scene: 'Inside the test vault.',
      relationship,
      transcript: [{
        id: 'turn:1:character',
        turnId: 'turn:1',
        sender: 'character',
        speaker: character.name,
        text: dirty,
        timestamp: 1,
      }],
    });
    const history = compiled.prompt.match(/<history>\n([\s\S]*?)\n<\/history>/)?.[1] ?? '';
    expect(history).toContain('*Peony checks the gauge.* "Steady."');
    expect(history).not.toContain('</assistant>');
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
