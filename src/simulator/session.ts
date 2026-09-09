import { resolveSimulationSubject } from '../runtime/schema/launch-package';
import type { DiagnosticsSnapshot, CharacterCard, ClientLaunchPackage, Persona, ProviderSettings, ResponseLengthMode, TranscriptMessage } from '../runtime/schema/types';
import type { RelationshipState } from '../runtime/relationships/schema';

export const SESSION_VERSION = 1 as const;

export type SimulatorSession = {
  version: typeof SESSION_VERSION;
  id: string;
  launchPackage: ClientLaunchPackage | null;
  character: CharacterCard | null;
  persona: Persona | null;
  scene: string;
  transcript: TranscriptMessage[];
  relationships: RelationshipState;
  diagnostics: DiagnosticsSnapshot[];
  settings: {
    provider: ProviderSettings;
    responseLength: ResponseLengthMode;
    crtMotion: boolean;
  };
  nextTurnNumber: number;
  startedAt: number;
  updatedAt: number;
};

export function createSession(now = Date.now(), launchPackage: ClientLaunchPackage | null = null): SimulatorSession {
  const character = launchPackage ? resolveSimulationSubject(launchPackage) : null;
  return {
    version: SESSION_VERSION,
    id: `simulation:${now.toString(36)}`,
    launchPackage,
    character,
    persona: launchPackage?.persona ?? null,
    scene: launchPackage?.scene ?? '',
    transcript: [],
    relationships: launchPackage?.relationshipState ?? {},
    diagnostics: [],
    settings: {
      provider: { kind: launchPackage ? 'orbis' : 'mock', model: launchPackage?.model ?? 'speculus-deterministic', temperature: 0.8, maxTokens: 850 },
      responseLength: launchPackage?.responseLength ?? 'adaptive',
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
