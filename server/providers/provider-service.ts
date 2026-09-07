import type { ProviderKind, SafeProviderMetadata } from '../../src/runtime/schema/types.js';
import type { ProviderRequest, ProviderResult } from '../../src/runtime/providers/types.js';

const NOVELAI_DEFAULT = 'https://text.novelai.net/oa/v1';
const OLLAMA_DEFAULT = 'http://127.0.0.1:11434';

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

function safeMetadata(provider: ProviderKind, model: string, url: string, started: number, requestId?: string): SafeProviderMetadata {
  const parsed = new URL(url);
  return { provider, model, endpoint: `${parsed.origin}${parsed.pathname}`, durationMs: Date.now() - started, requestId };
}

function extractNovelAiText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.output === 'string') return record.output;
  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as Record<string, unknown> | undefined;
    if (typeof first?.text === 'string') return first.text;
  }
  return '';
}

export async function generateWithProvider(provider: Exclude<ProviderKind, 'mock'>, request: ProviderRequest): Promise<ProviderResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    if (provider === 'novelai') {
      const base = request.baseUrl || process.env.NOVELAI_BASE_URL || NOVELAI_DEFAULT;
      const url = endpoint(base, '/completions');
      const token = request.apiToken || process.env.NOVELAI_TOKEN;
      if (!token) throw new Error('NovelAI access token is not configured.');
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || 'xialong-v1', prompt: request.prompt, max_tokens: request.maxTokens,
          temperature: request.temperature, top_p: 1, frequency_penalty: 0, presence_penalty: 0,
          stream: false, stop: ['\nPlayer:', '\nUser:', '\n<|user|>'],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`NovelAI-compatible endpoint returned HTTP ${response.status}.`);
      const value: unknown = await response.json();
      const text = extractNovelAiText(value);
      if (!text.trim()) throw new Error('NovelAI-compatible endpoint returned no text.');
      return { text, metadata: safeMetadata(provider, request.model, url, started, response.headers.get('x-request-id') ?? undefined) };
    }

    const base = request.baseUrl || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT;
    const url = endpoint(base, '/api/generate');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model, prompt: request.prompt, stream: false, keep_alive: '10m',
        options: { num_ctx: 16_384, num_predict: request.maxTokens, temperature: request.temperature, top_p: 0.95, repeat_penalty: 1.08 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const value = await response.json() as { response?: unknown };
    if (typeof value.response !== 'string' || !value.response.trim()) throw new Error('Ollama returned no text.');
    return { text: value.response, metadata: safeMetadata(provider, request.model, url, started) };
  } finally {
    clearTimeout(timeout);
  }
}
