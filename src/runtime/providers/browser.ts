import type { ProviderKind } from '../schema/types';
import type { ProviderAdapter, ProviderRequest, ProviderResult } from './types';

export class BrowserProvider implements ProviderAdapter {
  constructor(readonly kind: Exclude<ProviderKind, 'mock'>) {}

  async generate(request: ProviderRequest): Promise<ProviderResult> {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, signal: undefined, provider: this.kind }),
      signal: request.signal,
    });
    const body = await response.json() as { text?: string; metadata?: ProviderResult['metadata']; error?: string };
    if (!response.ok || !body.text || !body.metadata) throw new Error(body.error || `Provider request failed with HTTP ${response.status}.`);
    return { text: body.text, metadata: body.metadata };
  }
}
