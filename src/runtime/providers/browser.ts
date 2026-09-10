import type { ProviderKind } from '../schema/types';
import type { ProviderAdapter, ProviderRequest, ProviderResult } from './types';

function faultLabel(status: number): string {
  if (status === 400) return 'INVALID REQUEST';
  if (status === 401 || status === 403) return 'AUTHORIZATION EXPIRED';
  if (status === 408 || status === 504) return 'MODEL TIMEOUT';
  if (status === 413) return 'CONTEXT TOO LARGE';
  if (status === 429) return 'PROVIDER RATE LIMITED';
  if (status >= 500) return 'PROVIDER/BRIDGE FAILURE';
  return `HTTP ${status}`;
}

export class BrowserProvider implements ProviderAdapter {
  readonly kind = 'orbis' as const;

  async generate(request: ProviderRequest): Promise<ProviderResult> {
    let response: Response;
    try {
      response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, signal: undefined, provider: this.kind }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) throw new Error('MODEL CALL CANCELLED: generation was aborted.');
      const detail = error instanceof Error ? error.message : 'network request failed';
      throw new Error(`NETWORK/BRIDGE FAILURE: ${detail}`);
    }

    let body: { text?: string; metadata?: ProviderResult['metadata']; error?: string } = {};
    try {
      body = await response.json() as typeof body;
    } catch {
      throw new Error(`${faultLabel(response.status)}: bridge returned an unreadable response.`);
    }

    if (!response.ok) throw new Error(`${faultLabel(response.status)}: ${body.error || 'provider request failed.'}`);
    if (!body.text?.trim()) throw new Error('EMPTY GENERATION: provider returned no usable text.');
    if (!body.metadata) throw new Error('INVALID PROVIDER RESPONSE: generation metadata is missing.');
    return { text: body.text, metadata: body.metadata };
  }
}
