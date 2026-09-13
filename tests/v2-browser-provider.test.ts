import { afterEach, describe, expect, it, vi } from 'vitest';
import { V2BrowserProvider } from '../src/v2/providers/browser';

const request = {
  prompt: 'Render the current scene.', model: 'xialong-v1', temperature: 0.85, maxTokens: 512,
  topK: 250, topP: 0.95, presencePenalty: 0, frequencyPenalty: 0,
  stopSequences: [], continueToEndOfSentence: true,
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('V2 browser gateway errors', () => {
  it('preserves the actionable server error without retrying', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ error: 'NovelAI rejected the saved access token. Update it in Orbis Account settings.' }), { status: 502 }));
    vi.stubGlobal('fetch', upstream);
    await expect(new V2BrowserProvider('launch-fixture').generate(request)).rejects.toThrow('Update it in Orbis Account settings');
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each(['<html>Gateway failed</html>', 'null'])('reports a non-object gateway response instead of a JSON parsing crash', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 502 })));
    await expect(new V2BrowserProvider('launch-fixture').generate(request)).rejects.toThrow('V2 generation gateway returned an unreadable response (HTTP 502)');
  });
});
