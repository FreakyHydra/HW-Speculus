import { describe, expect, it } from 'vitest';
import type { ProviderAdapter, ProviderRequest } from '../src/runtime/providers/types';
import { DEFAULT_PROVIDER_SETTINGS } from '../src/runtime/generation/settings';
import { deleteCharacterTurn, runTurn } from '../src/simulator/engine';
import { createSession, type SimulatorSession } from '../src/simulator/session';
import { deserializeSession, serializeSession } from '../src/storage/session-storage';
import { character, persona } from './fixtures';

class CapturingProvider implements ProviderAdapter {
  readonly kind = 'mock' as const;
  requests: ProviderRequest[] = [];
  async generate(request: ProviderRequest) {
    this.requests.push(request);
    return { text: '*Peony nods once.* "Understood."', metadata: { provider: 'mock' as const, model: request.model, endpoint: 'test://provider', durationMs: 1 } };
  }
}

function readySession(): SimulatorSession {
  return { ...createSession(1000), character, persona, scene: 'A sealed workshop test.', settings: { provider: { kind: 'mock', model: 'test-model', ...DEFAULT_PROVIDER_SETTINGS, temperature: .5, maxTokens: 300 }, crtMotion: false } };
}

describe('simulator transaction', () => {
  it('completes an end-to-end mock turn with diagnostics', async () => {
    const provider = new CapturingProvider();
    const next = await runTurn(readySession(), 'Thank you for meeting me.', provider);
    expect(next.transcript.map((message) => message.sender)).toEqual(['player', 'character']);
    expect(next.diagnostics[0].compiledContext.prompt).toContain('Thank you for meeting me.');
    expect(next.diagnostics[0].provider.model).toBe('test-model');
  });

  it('passes compiled context without giving the adapter session state', async () => {
    const provider = new CapturingProvider();
    await runTurn(readySession(), 'Check the relay.', provider);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].prompt).toContain('<character>');
    expect(provider.requests[0]).not.toHaveProperty('session');
    expect(provider.requests[0]).not.toHaveProperty('relationships');
    expect(provider.requests[0]).not.toHaveProperty('character');
  });

  it('reroll replaces transcript, diagnostics, and relationship contribution', async () => {
    const provider = new CapturingProvider();
    const first = await runTurn(readySession(), 'I trust you.', provider);
    const characterTurn = first.transcript.find((message) => message.sender === 'character')!;
    const rerolled = await runTurn(first, 'I trust you.', provider, { rerollCharacterId: characterTurn.id });
    const record = getRecord(rerolled);
    expect(rerolled.transcript).toHaveLength(2);
    expect(rerolled.transcript[1].id).toBe(characterTurn.id);
    expect(record.events).toHaveLength(1);
    expect(rerolled.diagnostics).toHaveLength(1);
  });

  it('deleting a turn removes its relationship contribution', async () => {
    const next = await runTurn(readySession(), 'I trust you.', new CapturingProvider());
    const characterTurn = next.transcript.find((message) => message.sender === 'character')!;
    const deleted = deleteCharacterTurn(next, characterTurn.id);
    expect(deleted.transcript).toHaveLength(0);
    expect(getRecord(deleted).events).toHaveLength(0);
    expect(getRecord(deleted).score).toBe(0);
  });

  it('round-trips a persisted session', async () => {
    const next = await runTurn(readySession(), 'Hello.', new CapturingProvider());
    const raw = serializeSession(next);
    expect(deserializeSession(raw)).toEqual(next);
  });
});

function getRecord(session: SimulatorSession) {
  return session.relationships[`${character.id}::${persona.id}`];
}
