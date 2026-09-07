import type { ProviderKind, SafeProviderMetadata } from '../schema/types.js';

export type ProviderRequest = {
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  baseUrl?: string;
  apiToken?: string;
  reroll?: boolean;
  signal?: AbortSignal;
};

export type ProviderResult = { text: string; metadata: SafeProviderMetadata };

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  generate(request: ProviderRequest): Promise<ProviderResult>;
}
