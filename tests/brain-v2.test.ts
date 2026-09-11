import { describe, expect, it } from 'vitest';
import { createBeatPlan } from '../src/runtime/brain/planning/beat-plan';
import { canCommitPlaceId, createTurnAuthority } from '../src/runtime/brain/rules/mechanical';
import { compileContext } from '../src/runtime/generation/compile-context';
import { getRelationship } from '../src/runtime/relationships/core';
import type { RelationshipScorer } from '../src/runtime/relationships/evaluator';
import type { ProviderAdapter, ProviderRequest } from '../src/runtime/providers/types';
import type { ClientLaunchPackage, SafeProviderMetadata } from '../src/runtime/schema/types';
import { runTurn } from '../src/simulator/engine';
import { createSession } from '../src/simulator/session';
import { exportRawSession, resumeRawSession } from '../src/storage/session-transfer';
import { character, persona } from './fixtures';

function launch(type: ClientLaunchPackage['primaryAsset']['type'] = 'character'): ClientLaunchPackage {
  return {
    version: 1,
    launchId: 'brain-v2-launch',
    issuedAt: 1,
    expiresAt: Date.now() + 60_000,
    primaryAsset: {
      id: type === 'place' ? 'place:brackenjaw' : character.id,
      revision: 'v2-test',
      type,
      name: type === 'place' ? 'Brackenjaw Gate' : character.name,
      summary: type === 'place' ? 'A weathered gate cut into a black ridge.' : character.description,
      data: {},
    },
    relatedAssets: [],
    character,
    persona,
    scene: 'At the sealed outer threshold.',
    contextBlocks: [],
    relationshipState: {},
    model: 'test-model',
  };
}

class FixedProvider implements ProviderAdapter {
  readonly kind = 'mock' as const;
  constructor(private readonly text: string, private readonly metadata: Partial<SafeProviderMetadata> = {}) {}
  async generate(request: ProviderRequest) {
    return {
      text: this.text,
      metadata: {
        provider: 'mock' as const,
        model: request.model,
        endpoint: 'test://brain-v2',
        durationMs: 1,
        completionStatus: 'completed' as const,
        ...this.metadata,
      },
    };
  }
}

class SequenceProvider implements ProviderAdapter {
  readonly kind = 'mock' as const;
  requests: ProviderRequest[] = [];
  constructor(private readonly replies: string[]) {}
  async generate(request: ProviderRequest) {
    this.requests.push(request);
    return {
      text: this.replies[this.requests.length - 1] ?? this.replies.at(-1) ?? '',
      metadata: {
        provider: 'mock' as const,
        model: request.model,
        endpoint: 'test://brain-v2-sequence',
        durationMs: 1,
        completionStatus: 'completed' as const,
      },
    };
  }
}

describe('Speculus Brain V2 contracts', () => {
  it('creates an explicit policy snapshot and target protocol', () => {
    const session = createSession(100, launch('place'));
    expect(session.brain.schemaVersion).toBe('speculus-brain-config/1');
    expect(session.brain.policyProfileId).toBe('speculus-brain-v2-core');
    expect(session.brain.targetProtocol).toBe('place');
    expect(session.brain.policySnapshot.core.map((policy) => policy.id)).toContain('speculus.core.player-voice-ownership');
    expect(session.brain.mechanics).toMatchObject({
      playerVoice: 'player_only',
      npcPhysicalAgency: 'world_controlled',
      placeCreation: 'orbis_registry_only',
      moralitySource: 'authored_world_only',
    });
    expect(session.brain.policySnapshot.research).toEqual([]);
  });

  it('compiles the concise Brackenjaw fixture as one non-personified beat', () => {
    const session = createSession(100, launch('place'));
    session.brain.responseMode = 'concise';
    const beatPlan = createBeatPlan('place', 'concise', 'I touch the gate.');
    const authority = createTurnAuthority(session.launchPackage, persona);
    const compiled = compileContext({
      character,
      persona,
      scene: session.scene,
      transcript: [],
      relationship: getRelationship({}, character.id, persona.id),
      launchPackage: session.launchPackage,
      brain: session.brain,
      beatPlan,
      authority,
    });
    expect(compiled.manifest.maximumBeats).toBe(1);
    expect(compiled.manifest.targetProtocol).toBe('place');
    expect(compiled.prompt).toContain('Render exactly one immediate meaningful reaction or consequence.');
    expect(compiled.prompt).toContain('A place is not a character.');
    expect(compiled.prompt).toContain('WORLD-001');
    expect(compiled.prompt).toContain('Speculus adds no universal morality layer.');
  });

  it('permits only Orbis Place IDs to be committed as formal Places', () => {
    const authority = createTurnAuthority(launch('place'), persona);
    expect(canCommitPlaceId(authority, 'place:brackenjaw')).toBe(true);
    expect(canCommitPlaceId(authority, 'place:invented')).toBe(false);
  });

  it('returns provider output at the length ceiling instead of rejecting it', async () => {
    const session = createSession(100, launch());
    const provider = new FixedProvider('*Peony turns toward the', { completionStatus: 'max_tokens', finishReason: 'length' });
    const next = await runTurn(session, 'Hello.', provider);
    expect(next.transcript.at(-1)?.text).toContain('Peony turns toward');
    expect(next.diagnostics.at(-1)?.provider.completionStatus).toBe('max_tokens');
  });

  it('rejects a voluntary action invented for the named player', async () => {
    const session = createSession(100, launch());
    const provider = new FixedProvider('*Skyler nods and steps closer.* "Good."');
    await expect(runTurn(session, 'I wait.', provider)).rejects.toThrow(/invents a voluntary action for Skyler/i);
  });

  it('rejects a voluntary second-person action invented for the player', async () => {
    const session = createSession(100, launch());
    const provider = new FixedProvider('*You step through the open door.* "Welcome."');
    await expect(runTurn(session, 'I inspect the door.', provider)).rejects.toThrow(/invents a voluntary action for Skyler/i);
  });

  it('allows an NPC to physically overpower and move the player', async () => {
    const session = createSession(100, launch('place'));
    const provider = new FixedProvider('*Ragna gestures, and the Wardens haul you to your feet.* "We will talk at the station."');
    const next = await runTurn(session, 'I look up from my restraints.', provider);
    expect(next.transcript.at(-1)?.text).toContain('haul you to your feet');
  });

  it('rejects dialogue attributed to the player', async () => {
    const session = createSession(100, launch());
    const provider = new FixedProvider('*Peony waits.* "I will cooperate," you say.');
    await expect(runTurn(session, 'I watch her.', provider)).rejects.toThrow(/speaks for Skyler/i);
  });

  it('rejects invented private player thoughts', async () => {
    const session = createSession(100, launch());
    const provider = new FixedProvider('*You realize Peony must be lying.*');
    await expect(runTurn(session, 'I watch her.', provider)).rejects.toThrow(/invents a private state for Skyler/i);
  });

  it('uses the concise provider ceiling without post-rejecting for paragraph count', async () => {
    const session = createSession(100, launch('place'));
    session.brain.responseMode = 'concise';
    const provider = new SequenceProvider([[
      '*The trail forked before you beneath the Brackenjaw sign.*',
      '*Farther ahead, the trail opened into a village clearing and revealed the ranger station.*',
      '*A young coyote crossed from the inn and called out to you.* "Traveler!"',
    ].join('\n')]);
    const next = await runTurn(session, '"This must be it."', provider);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].maxTokens).toBe(200);
    expect(provider.requests[0]).toMatchObject({
      temperature: 0.85, topK: 250, topP: 0.95,
      presencePenalty: 0, frequencyPenalty: 0,
      stopSequences: [], continueToEndOfSentence: true,
    });
    expect(next.transcript.at(-1)?.text).toContain('Traveler!');
  });

  it('never sends an unsubmitted composer draft to the provider', async () => {
    const session = createSession(100, launch('place'));
    session.composerDraft = {
      text: 'UNSUBMITTED PRIVATE DRAFT: I plan to betray the Wardens.',
      updatedAt: 101,
      submitted: false,
    };
    const provider = new SequenceProvider([
      '*The weathered gate remains closed while the Warden waits beside it.*',
    ]);

    await runTurn(session, 'I ask whether the road is open.', provider);

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].prompt).not.toContain('UNSUBMITTED PRIVATE DRAFT');
    expect(provider.requests[0].prompt).not.toContain('betray the Wardens');
    expect(provider.requests[0].prompt).toContain('I ask whether the road is open.');
  });

  it('automatically replaces a player-control violation from the frozen turn', async () => {
    const session = createSession(100, launch('place'));
    session.brain.responseMode = 'concise';
    const provider = new SequenceProvider([
      '*Skyler nods and walks toward the gate.*',
      '*The weathered Brackenjaw sign creaks above the fork while both marked trails remain quiet.*',
    ]);
    const next = await runTurn(session, '"This must be it."', provider);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1].prompt).toContain('<revision>');
    expect(provider.requests.every((request) => request.maxTokens === 200)).toBe(true);
    expect(next.transcript.at(-1)?.text).toContain('Brackenjaw sign creaks');
    expect(next.diagnostics.at(-1)?.compiledContext.manifest.includedSections).toContain('revision');
  });

  it('allows the narrator to preserve a restraint state authored by the player', async () => {
    const session = createSession(100, launch('place'));
    const provider = new FixedProvider('*Two Boundary Wardens remain over you while one checks the restraints already around your wrists.* "Captain is coming."');
    const next = await runTurn(session, '*I wake restrained and look up at them.*', provider);
    expect(next.transcript.at(-1)?.text).toContain('checks the restraints');
  });

  it('scores a reroll from the frozen pre-turn relationship state', async () => {
    const seenScores: number[] = [];
    const scorer: RelationshipScorer = {
      evaluate(input) {
        seenScores.push(input.previousScore);
        return { delta: 5, reason: 'fixture', dimensionDeltas: { trust: 1 } };
      },
    };
    const provider = new FixedProvider('*Peony nods once.* "All right."');
    const first = await runTurn(createSession(100, launch()), 'I trust you.', provider, { scorer });
    const reply = first.transcript.find((message) => message.sender === 'character')!;
    const rerolled = await runTurn(first, 'I trust you.', provider, { rerollCharacterId: reply.id, scorer });
    expect(seenScores).toEqual([0, 0]);
    expect(getRelationship(rerolled.relationships, character.id, persona.id).score).toBe(5);
  });

  it('exports the policy snapshot and migrates exports created before Brain V2', () => {
    const current = createSession(100, launch());
    current.brain.responseMode = 'normal';
    const exported = JSON.parse(exportRawSession(current, 200)) as { state: Record<string, unknown> };
    expect(exported.state.brain).toEqual(current.brain);

    delete exported.state.brain;
    const resumed = resumeRawSession(createSession(300, launch()), JSON.stringify(exported), 400);
    expect(resumed.brain.schemaVersion).toBe('speculus-brain-config/1');
    expect(resumed.brain.targetProtocol).toBe('character');
  });
});
