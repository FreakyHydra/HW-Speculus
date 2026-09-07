// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { character, persona } from './fixtures';

const originalSecret = process.env.SPECULUS_BRIDGE_SECRET;
const originalOrigin = process.env.SPECULUS_PUBLIC_ORIGIN;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SPECULUS_BRIDGE_SECRET;
  else process.env.SPECULUS_BRIDGE_SECRET = originalSecret;
  if (originalOrigin === undefined) delete process.env.SPECULUS_PUBLIC_ORIGIN;
  else process.env.SPECULUS_PUBLIC_ORIGIN = originalOrigin;
});

function packageBody() {
  const now = Date.now();
  return {
    version: 1,
    launchId: 'bridge-launch-001',
    issuedAt: now,
    expiresAt: now + 60_000,
    primaryAsset: { id: character.id, revision: 'rev-9', type: 'character', name: character.name, summary: '', data: {} },
    relatedAssets: [], character, persona, scene: 'Bridge test.', contextBlocks: [], relationshipState: {},
    model: 'xialong-v1', generationGrant: 'private-orbis-generation-grant',
  };
}

describe('one-time Orbis launch bridge', () => {
  it('authenticates deposits, claims once, and never exposes the generation grant', async () => {
    process.env.SPECULUS_BRIDGE_SECRET = 'server-to-server-test-secret';
    process.env.SPECULUS_PUBLIC_ORIGIN = 'https://spec.thehowlingwhispers.com';
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      const unauthorized = await fetch(`${base}/api/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packageBody()) });
      expect(unauthorized.status).toBe(401);

      const deposited = await fetch(`${base}/api/launch`, {
        method: 'POST',
        headers: { Authorization: 'Bearer server-to-server-test-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify(packageBody()),
      });
      expect(deposited.status).toBe(201);
      const depositBody = await deposited.json() as { launchUrl: string };
      const code = new URL(depositBody.launchUrl).searchParams.get('launch');
      expect(code).toBeTruthy();

      const claimed = await fetch(`${base}/api/launch/${code}`);
      expect(claimed.status).toBe(200);
      expect(claimed.headers.get('set-cookie')).toContain('HttpOnly');
      const safeText = await claimed.text();
      expect(safeText).not.toContain('private-orbis-generation-grant');
      expect(JSON.parse(safeText).package.primaryAsset.revision).toBe('rev-9');

      const replay = await fetch(`${base}/api/launch/${code}`);
      expect(replay.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
