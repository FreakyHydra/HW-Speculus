import { describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter } from '../src/runtime/providers/types';
import { publicV2Package } from '../src/v2/contracts/launch';
import { compileV2Context } from '../src/v2/runtime/context';
import { generateV2Turn } from '../src/v2/runtime/engine';
import { createV2Session } from '../src/v2/runtime/session';
import { v2Package } from './v2-fixtures';

const provider = () => ({
  kind: 'mock',
  generate: vi.fn(async () => ({
    text: '*Peony nods.* "Hello."',
    metadata: { provider: 'mock' as const, model: 'xialong-v1', endpoint: 'mock', durationMs: 1, completionStatus: 'completed' as const },
  })),
}) satisfies ProviderAdapter;

describe('V2 recent exchange formatting', () => {
  it('feeds prior roleplay back as plain transcript text instead of JSON-escaped prose', async () => {
    const base = createV2Session(publicV2Package(v2Package()));
    const first = await generateV2Turn({ ...base, draft: '"Hello."' }, provider());
    const packet = compileV2Context(first, '"Again."');

    expect(packet.prompt).toContain('[AUTHORIZED SUBJECT RESPONSE]\n*Peony nods.* "Hello."\n[END RECENT EXCHANGE]');
    expect(packet.prompt).not.toContain('\\"Hello.\\"');
    expect(packet.prompt).not.toContain('\\n*Peony nods.*');
  });
});