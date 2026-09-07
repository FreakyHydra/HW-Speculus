import { z } from 'zod';
import { SESSION_VERSION, createSession, type SimulatorSession } from '../simulator/session';

export const SESSION_STORAGE_KEY = 'speculus.session.v1';

const storedSchema = z.object({
  version: z.literal(SESSION_VERSION),
  id: z.string(),
  character: z.unknown().nullable(),
  persona: z.unknown().nullable(),
  scene: z.string(),
  transcript: z.array(z.unknown()),
  relationships: z.record(z.string(), z.unknown()),
  diagnostics: z.array(z.unknown()),
  settings: z.object({
    provider: z.object({ kind: z.enum(['mock', 'novelai', 'ollama']), model: z.string(), baseUrl: z.string(), temperature: z.number(), maxTokens: z.number() }),
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
  return result.data as SimulatorSession;
}

export function loadSession(storage: Pick<Storage, 'getItem'> = localStorage): SimulatorSession {
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return createSession();
  try { return deserializeSession(raw); } catch { return createSession(); }
}

export function saveSession(session: SimulatorSession, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(SESSION_STORAGE_KEY, serializeSession(session));
}
