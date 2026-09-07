import { z } from 'zod';
import { SESSION_VERSION, type SimulatorSession } from '../simulator/session';

export const SESSION_STORAGE_KEY = 'speculus.session.v1';

const storedSchema = z.object({
  version: z.literal(SESSION_VERSION),
  id: z.string(),
  launchPackage: z.unknown().nullable(),
  character: z.unknown().nullable(),
  persona: z.unknown().nullable(),
  scene: z.string(),
  transcript: z.array(z.unknown()),
  relationships: z.record(z.string(), z.unknown()),
  diagnostics: z.array(z.unknown()),
  settings: z.object({
    provider: z.object({ kind: z.enum(['mock', 'orbis']), model: z.string(), temperature: z.number(), maxTokens: z.number() }),
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
