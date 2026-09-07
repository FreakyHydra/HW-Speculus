import type { DiagnosticsSnapshot, CharacterCard, Persona, ProviderSettings, TranscriptMessage } from '../runtime/schema/types';
import type { RelationshipState } from '../runtime/relationships/schema';

export const SESSION_VERSION = 1 as const;

export type SimulatorSession = {
  version: typeof SESSION_VERSION;
  id: string;
  character: CharacterCard | null;
  persona: Persona | null;
  scene: string;
  transcript: TranscriptMessage[];
  relationships: RelationshipState;
  diagnostics: DiagnosticsSnapshot[];
  settings: {
    provider: ProviderSettings;
    crtMotion: boolean;
  };
  nextTurnNumber: number;
  startedAt: number;
  updatedAt: number;
};

export function createSession(now = Date.now()): SimulatorSession {
  return {
    version: SESSION_VERSION,
    id: `simulation:${now.toString(36)}`,
    character: null,
    persona: null,
    scene: '',
    transcript: [],
    relationships: {},
    diagnostics: [],
    settings: {
      provider: { kind: 'mock', model: 'speculus-deterministic', baseUrl: '', temperature: 0.8, maxTokens: 850 },
      crtMotion: true,
    },
    nextTurnNumber: 1,
    startedAt: now,
    updatedAt: now,
  };
}

export function withOpeningMessage(session: SimulatorSession): SimulatorSession {
  if (!session.character?.firstMessage || session.transcript.length > 0) return session;
  const timestamp = Date.now();
  return {
    ...session,
    transcript: [{
      id: 'opening:character', turnId: 'opening', sender: 'character', speaker: session.character.name,
      text: session.character.firstMessage, timestamp,
    }],
    updatedAt: timestamp,
  };
}
