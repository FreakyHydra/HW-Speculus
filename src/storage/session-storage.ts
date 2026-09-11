import { z } from 'zod';
import { SESSION_VERSION, type SimulatorSession } from '../simulator/session';
import { normalizeBrainConfig } from '../runtime/brain/policies/core';
import { resolveTargetProtocol } from '../runtime/brain/protocols/target';
import { getResponseCalibration } from '../runtime/generation/compile-context';
import { normalizeProviderSettings } from '../runtime/generation/settings';

export const SESSION_STORAGE_KEY = 'speculus.session.v1';

const storedSchema = z.object({
  version: z.literal(SESSION_VERSION),
  id: z.string(),
  launchPackage: z.unknown().nullable(),
  character: z.unknown().nullable(),
  persona: z.unknown().nullable(),
  scene: z.string(),
  influence: z.object({
    tags: z.array(z.string()),
    freeform: z.string(),
  }).optional(),
  composerDraft: z.object({
    text: z.string(),
    updatedAt: z.number(),
    submitted: z.literal(false),
  }).optional(),
  transcript: z.array(z.unknown()),
  relationships: z.record(z.string(), z.unknown()),
  brain: z.unknown().optional(),
  diagnostics: z.array(z.unknown()),
  settings: z.object({
    provider: z.object({
      kind: z.enum(['mock', 'orbis']), model: z.string(),
      preset: z.enum(['novelai-default', 'custom']).optional(),
      temperature: z.number(), maxTokens: z.number(),
      outputLengthCharacters: z.number().optional(), topK: z.number().optional(), topP: z.number().optional(),
      presencePenalty: z.number().optional(), frequencyPenalty: z.number().optional(),
      stopSequences: z.array(z.string()).optional(), continueToEndOfSentence: z.boolean().optional(),
    }),
    crtMotion: z.boolean(),
  }),
  nextTurnNumber: z.number().int().positive(),
  startedAt: z.number(),
  updatedAt: z.number(),
});

export function serializeSession(session: SimulatorSession): string {
  const safe = structuredClone(session);
  return JSON.stringify(safe);
}

export function deserializeSession(raw: string): SimulatorSession {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Stored session JSON is malformed.'); }
  const result = storedSchema.safeParse(parsed);
  if (!result.success) throw new Error('Stored session is not a supported Speculus session.');
  const session = result.data as Omit<SimulatorSession, 'brain'> & { brain?: unknown };
  return {
    ...session,
    settings: {
      ...session.settings,
      provider: normalizeProviderSettings(session.settings.provider as SimulatorSession['settings']['provider']),
    },
    composerDraft: session.composerDraft ?? { text: '', updatedAt: session.updatedAt, submitted: false },
    brain: normalizeBrainConfig(session.brain, resolveTargetProtocol(session.launchPackage), getResponseCalibration()),
  } as SimulatorSession;
}

export function loadSession(storage: Pick<Storage, 'getItem'> = sessionStorage): SimulatorSession | null {
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try { return deserializeSession(raw); } catch { return null; }
}

export function saveSession(session: SimulatorSession, storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  storage.setItem(SESSION_STORAGE_KEY, serializeSession(session));
}

export function clearSession(storage: Pick<Storage, 'removeItem'> = sessionStorage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}
