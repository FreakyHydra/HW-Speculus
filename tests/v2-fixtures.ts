import { character, persona } from './fixtures';
import type { V2LaunchPackage } from '../src/v2/contracts/launch';

export function v2Package(overrides: Partial<V2LaunchPackage> = {}): V2LaunchPackage {
  const now = Date.now();
  return {
    version: 2, engine: 'v2', launchId: 'v2-launch-fixture', issuedAt: now, expiresAt: now + 3600_000,
    primaryAsset: { id: character.id, type: 'character', revision: 'rev-1', name: character.name, summary: character.description, data: { description: character.description } },
    relatedAssets: [{ id: 'place:workshop', type: 'place', revision: 'rev-1', name: 'Workshop', summary: 'A quiet workshop.', data: {} }],
    character, persona, scene: character.scenario, contextBlocks: [], relationshipState: {},
    model: 'xialong-v1', generationGrant: 'test-only-opaque-generation-grant', ...overrides,
  };
}
