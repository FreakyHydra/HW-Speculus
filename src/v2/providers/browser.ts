import type { ProviderAdapter, ProviderRequest, ProviderResult } from '../../runtime/providers/types';

export class V2BrowserProvider implements ProviderAdapter {
  readonly kind = 'orbis' as const;
  constructor(private readonly launchId: string) {}

  async generate(request: ProviderRequest): Promise<ProviderResult> {
    const response = await fetch('/api/v2/generate', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, signal: undefined, provider: 'orbis', launchId: this.launchId }), signal: request.signal,
    });
    const body = await response.json() as Partial<ProviderResult> & { error?: string };
    if (!response.ok) throw new Error(body.error || `V2 generation failed (HTTP ${response.status}).`);
    if (typeof body.text !== 'string' || !body.metadata) throw new Error('The V2 bridge returned an invalid response.');
    return { text: body.text, metadata: body.metadata };
  }
}
