import { describe, expect, it } from 'vitest';
import type { ProviderAdapter, ProviderRequest } from '../src/runtime/providers/types';
import { selectRuntime } from '../src/runtime/protocols/router';
import type { ClientLaunchPackage, SimulationAssetType } from '../src/runtime/schema/types';
import { runTurn } from '../src/simulator/engine';
import { createSession } from '../src/simulator/session';
import { character, persona } from './fixtures';

class CapturingProvider implements ProviderAdapter {
  readonly kind = 'mock' as const;
  requests: ProviderRequest[] = [];
  async generate(request: ProviderRequest) {
    this.requests.push(request);
    return {
      text: '*Ragna considers the doctor\'s assessment.* "Then explain what Pip felt."',
      metadata: { provider: 'mock' as const, model: request.model, endpoint: 'test://provider', durationMs: 1 },
    };
  }
}

function packageFor(type: SimulationAssetType): ClientLaunchPackage {
  const primaryCharacter = type === 'character' ? character : null;
  return {
    version: 1,
    launchId: `launch-${type}-runtime`,
    issuedAt: 1,
    expiresAt: 2,
    primaryAsset: {
      id: type === 'character' ? character.id : `${type}:primary`, revision: 'rev-1', type,
      name: type === 'world' ? 'Bitterroot' : type === 'place' ? 'Brackenjaw Ranger Station' : character.name,
      summary: `A ${type} test asset.`,
      data: type === 'world'
        ? { worldRules: ['No humans exist.'], enormousUnrelatedArchive: 'DO NOT INCLUDE THIS WHOLE ARCHIVE' }
        : {},
    },
    relatedAssets: type === 'character' ? [] : [
      { id: 'character:ragna', revision: '1', type: 'character', name: 'Ragna', summary: 'A careful Boundary Warden.', data: { personality: 'Observant and protective.' } },
      { id: 'character:pip', revision: '1', type: 'character', name: 'Pip', summary: 'Ragna\'s daughter.', data: { personality: 'Curious and warm.' } },
      { id: 'place:remote', revision: '1', type: 'place', name: 'Remote Valley', summary: 'Not part of this scene.', data: { archive: 'UNRELATED PLACE DATA' } },
    ],
    character: primaryCharacter,
    persona,
    scene: type === 'character' ? 'A lamp-lit workshop.' : 'A doctor examines Pip while Ragna watches.',
    contextBlocks: [],
    relationshipState: {},
    model: 'xialong-v1',
  };
}

describe('SPC runtime router', () => {
  it.each([
    ['character', 'CharacterRuntime'],
    ['world', 'WorldRuntime'],
    ['place', 'PlaceRuntime'],
    ['item', 'ItemRuntime'],
    ['object', 'ItemRuntime'],
    ['faction', 'FactionRuntime'],
    ['society', 'SocietyRuntime'],
    ['clan', 'SocietyRuntime'],
    ['family', 'FamilyRuntime'],
    ['event', 'EventRuntime'],
    ['memory', 'EventRuntime'],
    ['species', 'SpeciesRuntime'],
  ] as const)('routes %s to %s', (type, protocol) => {
    expect(selectRuntime(packageFor(type)).protocol).toBe(protocol);
  });

  it('uses an explicit safe GenericRuntime for unsupported SPC types', () => {
    const runtime = selectRuntime(packageFor('other'));
    expect(runtime.protocol).toBe('GenericRuntime');
    expect(runtime.speakingPrimary).toBe(false);
  });

  it('can route a legacy other asset from its explicit SPC classification', () => {
    const launchPackage = packageFor('other');
    launchPackage.catalog = {
      code: 'SPC-X-AB00001', prefix: 'X', plate: 'AB00001', generation: 1,
      registryNumber: 1, classRegistryNumber: 1, classification: 'FAMILY',
      createdAt: '2026-09-09T00:00:00.000Z', status: 'active',
    };
    expect(selectRuntime(launchPackage).protocol).toBe('FamilyRuntime');
  });

  it('preserves the existing CharacterRuntime compiler and speaker behavior', async () => {
    const provider = new CapturingProvider();
    const next = await runTurn(createSession(1000, packageFor('character')), 'Hello, Peony.', provider);
    expect(next.transcript.at(-1)).toMatchObject({ sender: 'character', speaker: 'Peony' });
    expect(provider.requests[0].prompt).toContain("Write only Peony's next response.");
    expect(next.diagnostics[0].runtime?.selectedProtocol).toBe('CharacterRuntime');
  });

  it.each(['world', 'place'] as const)('does not make a %s the speaking character identity', async (type) => {
    const provider = new CapturingProvider();
    const next = await runTurn(createSession(1000, packageFor(type)), 'I look at Ragna. "What do you think?"', provider);
    const reply = next.transcript.at(-1)!;
    expect(reply.sender).toBe('controller');
    expect(reply.speaker).toBe('SCENE CONTROLLER');
    expect(reply.speaker).not.toBe(next.launchPackage?.primaryAsset.name);
    expect(provider.requests[0].prompt).not.toContain(`Write only ${next.launchPackage?.primaryAsset.name}'s next response.`);
    expect(provider.requests[0].prompt).toContain('Never use it as a speaking character identity.');
  });

  it('resolves active characters separately and keeps bare mentions inactive', async () => {
    const next = await runTurn(
      createSession(1000, packageFor('world')),
      'I look at Ragna and mention Pip by name.',
      new CapturingProvider(),
    );
    expect(next.diagnostics[0].activeCast.active.map((member) => member.id)).toEqual(['character:ragna']);
    expect(next.diagnostics[0].activeCast.mentionedOnly).toContain('Pip');
  });

  it('attaches relationships to active character IDs, not world or place IDs', async () => {
    const next = await runTurn(
      createSession(1000, packageFor('world')),
      'Ragna, thank you for trusting me. Pip may stay nearby.',
      new CapturingProvider(),
    );
    expect(next.relationships['character:ragna::persona:skyler']).toBeDefined();
    expect(next.relationships['world:primary::persona:skyler']).toBeUndefined();
    expect(next.relationships['character:pip::persona:skyler']).toBeUndefined();
    expect(next.diagnostics[0].runtime?.relationshipTargets).toEqual([{ id: 'character:ragna', name: 'Ragna' }]);
  });

  it('reports protocol, controller, cast dependencies, and excludes unrelated world data', async () => {
    const provider = new CapturingProvider();
    const next = await runTurn(createSession(1000, packageFor('world')), 'I look at Ragna.', provider);
    const runtime = next.diagnostics[0].runtime!;
    expect(runtime.selectedProtocol).toBe('WorldRuntime');
    expect(runtime.primaryAsset).toMatchObject({ id: 'world:primary', name: 'Bitterroot', type: 'world' });
    expect(runtime.sceneController.role).toBe('scene-controller');
    expect(runtime.includedDependencies.map((dependency) => dependency.id)).toEqual(['character:ragna', 'character:pip']);
    expect(next.diagnostics[0].compiledContext.manifest.runtimeProtocol).toBe('WorldRuntime');
    expect(provider.requests[0].prompt).toContain('worldRules');
    expect(provider.requests[0].prompt).not.toContain('DO NOT INCLUDE THIS WHOLE ARCHIVE');
    expect(provider.requests[0].prompt).not.toContain('UNRELATED PLACE DATA');
  });
});
