import type { SafeProviderMetadata, SimulationAsset } from '../../src/runtime/schema/types.js';
import type { ProviderRequest, ProviderResult } from '../../src/runtime/providers/types.js';

export type GenerationSession = {
  launchId: string;
  generationGrant: string;
  source: Pick<SimulationAsset, 'id' | 'revision' | 'type'>;
  expiresAt: number;
};

function extractText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.reply === 'string') return record.reply;
  return '';
}

export async function generateThroughOrbis(session: GenerationSession, request: ProviderRequest): Promise<ProviderResult> {
  const base = process.env.ORBIS_GENERATION_API_URL;
  if (!base) throw new Error('The Orbis generation bridge is not configured.');
  if (session.expiresAt <= Date.now()) throw new Error('The Orbis simulation authorization has expired. Launch the item again.');
  const url = base.replace(/\/$/, '');
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.generationGrant}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          launchId: session.launchId,
          source: session.source,
          prompt: request.prompt,
          model: request.model,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          reroll: request.reroll === true,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('MODEL TIMEOUT: the Orbis generation bridge exceeded 180 seconds.');
      const detail = error instanceof Error ? error.message : 'network request failed';
      throw new Error(`ORBIS NETWORK FAILURE: ${detail}`);
    }
    if (!response.ok) throw new Error(`Orbis generation bridge returned HTTP ${response.status}.`);
    const value: unknown = await response.json();
    const text = extractText(value);
    if (!text.trim()) throw new Error('EMPTY GENERATION: Orbis generation bridge returned no roleplay text.');
    const parsed = new URL(url);
    const metadata: SafeProviderMetadata = {
      provider: 'orbis',
      model: request.model,
      endpoint: `${parsed.origin}${parsed.pathname}`,
      durationMs: Date.now() - started,
      requestId: response.headers.get('x-request-id') ?? undefined,
      inputTokensEstimate: Math.ceil(request.prompt.length / 4),
    };
    return { text, metadata };
  } finally {
    clearTimeout(timeout);
  }
}
