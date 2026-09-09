import { describe, expect, it } from 'vitest';
import { createSession } from '../src/simulator/session';
import { exportRawSession, parseRawSession, resumeRawSession } from '../src/storage/session-transfer';
import type { ClientLaunchPackage } from '../src/runtime/schema/types';
import { character, persona } from './fixtures';

function launch(assetId = 'asset-1'): ClientLaunchPackage {
  return {
    version: 1,
    launchId: 'launch-1',
    issuedAt: 1,
    expiresAt: Date.now() + 60_000,
    primaryAsset: { id: assetId, revision: 'rev-new', type: 'character', name: 'Peony', summary: 'Test', data: {} },
    relatedAssets: [],
    character,
    persona,
    scene: 'Fresh scene',
    contextBlocks: [],
    relationshipState: {},
    model: 'glm-4-6',
  };
}

describe('raw Speculus session transfer', () => {
  it('exports resumable state without exporting a stale launch package', () => {
    const session = createSession(100, launch());
    session.scene = 'Old scene';
    session.transcript = [{ id: 'm1', turnId: 't1', sender: 'player', speaker: 'Skyler', text: 'Hello', timestamp: 101 }];
    const raw = exportRawSession(session, 500);
    const parsed = parseRawSession(raw);

    expect(parsed.format).toBe('speculus-raw-session');
    expect(parsed.source.assetId).toBe('asset-1');
    expect(parsed.state.scene).toBe('Old scene');
    expect(parsed.state.transcript).toHaveLength(1);
    expect(raw).not.toContain('expiresAt');
    expect(raw).not.toContain('launchId');
  });

  it('resumes old state onto the fresh Orbis launch package', () => {
    const oldSession = createSession(100, launch());
    oldSession.scene = 'Continued scene';
    oldSession.nextTurnNumber = 7;
    oldSession.transcript = [{ id: 'm1', turnId: 't1', sender: 'character', speaker: 'Peony', text: 'Still here.', timestamp: 101 }];
    const raw = exportRawSession(oldSession, 500);

    const fresh = createSession(1_000, { ...launch(), launchId: 'fresh-launch', expiresAt: Date.now() + 120_000, model: 'xialong-v1' });
    const resumed = resumeRawSession(fresh, raw, 2_000);

    expect(resumed.scene).toBe('Continued scene');
    expect(resumed.transcript[0].text).toBe('Still here.');
    expect(resumed.nextTurnNumber).toBe(7);
    expect(resumed.launchPackage?.launchId).toBe('fresh-launch');
    expect(resumed.settings.provider.model).toBe(fresh.settings.provider.model);
    expect(resumed.updatedAt).toBe(2_000);
  });

  it('refuses to import a session into the wrong Orbis asset', () => {
    const raw = exportRawSession(createSession(100, launch('asset-a')), 500);
    expect(() => resumeRawSession(createSession(1_000, launch('asset-b')), raw)).toThrow(/belongs to Peony/);
  });
});
