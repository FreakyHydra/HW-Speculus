import { describe, expect, it } from 'vitest';
import { clientLaunchPackage, parseOrbisLaunchPackage, resolveSimulationSubject } from '../src/runtime/schema/launch-package';
import { createSession } from '../src/simulator/session';
import { character, persona } from './fixtures';

function launchPackage(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    version: 1,
    launchId: 'launch-test-001',
    issuedAt: now,
    expiresAt: now + 60_000,
    primaryAsset: { id: character.id, revision: 'rev-7', type: 'character', name: character.name, summary: character.description, data: { source: 'orbis' } },
    relatedAssets: [],
    character,
    persona,
    scene: 'A boxed Orbis test scene.',
    contextBlocks: [{ id: 'world-law', title: 'World law', content: 'No humans exist here.' }],
    relationshipState: {},
    model: 'xialong-v1',
    generationGrant: 'opaque-generation-grant',
    ...overrides,
  };
}

describe('Orbis launch package', () => {
  it('validates a versioned package and redacts the generation grant for the browser', () => {
    const parsed = parseOrbisLaunchPackage(launchPackage());
    const safe = clientLaunchPackage(parsed);
    expect(safe.primaryAsset.revision).toBe('rev-7');
    expect(safe).not.toHaveProperty('generationGrant');
    expect(JSON.stringify(safe)).not.toContain('opaque-generation-grant');
  });

  it('rejects expired and mismatched packages', () => {
    expect(() => parseOrbisLaunchPackage(launchPackage({ expiresAt: Date.now() - 1 }))).toThrow(/expired/i);
    expect(() => parseOrbisLaunchPackage(launchPackage({ primaryAsset: { id: 'wrong', revision: '1', type: 'character', name: 'Wrong', summary: '', data: {} } }))).toThrow(/does not match/i);
  });

  it('boots a packaged world through a narrator subject without manual imports', () => {
    const parsed = parseOrbisLaunchPackage(launchPackage({
      primaryAsset: { id: 'world:bitterroot', revision: '12', type: 'world', name: 'Bitterroot', summary: 'A dangerous wilderness.', data: { humans: false } },
      character: null,
    }));
    const safe = clientLaunchPackage(parsed);
    expect(resolveSimulationSubject(safe).systemPrompt).toContain('simulation narrator');
    const session = createSession(Date.now(), safe);
    expect(session.character?.name).toBe('Bitterroot');
    expect(session.persona?.name).toBe('Skyler');
    expect(session.settings.provider.kind).toBe('orbis');
  });
});
