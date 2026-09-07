import type { ProviderAdapter, ProviderRequest } from './types';

export class MockProvider implements ProviderAdapter {
  readonly kind = 'mock' as const;
  async generate(request: ProviderRequest) {
    const started = performance.now();
    const alternate = request.reroll
      ? '*The terminal relay clicks. The subject studies you from a new angle.* "Let us try that answer differently."'
      : '*The subject turns toward the field terminal, attentive but cautious.* "I am here. What would you like to test?"';
    return {
      text: alternate,
      metadata: {
        provider: this.kind,
        model: request.model || 'speculus-deterministic',
        endpoint: 'internal://mock',
        durationMs: Math.round(performance.now() - started),
        inputTokensEstimate: Math.ceil(request.prompt.length / 4),
      },
    };
  }
}
