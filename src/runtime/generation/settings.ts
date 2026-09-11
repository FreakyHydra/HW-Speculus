import type { ProviderSettings } from '../schema/types.js';

export const NOVELAI_DEFAULT_STOP_SEQUENCES = [
  '<|user|>',
  '<|assistant|>',
  'System:',
  'Analysis:',
  'Thinking:',
  '/nothink',
] as const;

export const DEFAULT_PROVIDER_SETTINGS: Omit<ProviderSettings, 'kind' | 'model'> = {
  preset: 'novelai-default',
  temperature: 0.85,
  maxTokens: 850,
  outputLengthCharacters: 1024,
  topK: 250,
  topP: 0.95,
  presencePenalty: 0,
  frequencyPenalty: 0,
  stopSequences: [],
  continueToEndOfSentence: true,
};

export function normalizeProviderSettings(settings: ProviderSettings): ProviderSettings {
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settings,
    stopSequences: Array.isArray(settings.stopSequences)
      ? settings.stopSequences.map((value) => value.trim()).filter(Boolean).slice(0, 16)
      : [],
  };
}

export function outputTokenAllowance(settings: ProviderSettings, responseModeLimit: number): number {
  const characterAllowance = Math.max(32, Math.ceil(settings.outputLengthCharacters / 4));
  return Math.min(settings.maxTokens, responseModeLimit, characterAllowance);
}
