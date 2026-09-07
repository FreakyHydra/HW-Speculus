export type CharacterCard = {
  kind: 'character';
  id: string;
  spec: 'chara_card_v2';
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogue: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  tags: string[];
};

export type Persona = {
  kind: 'persona';
  id: string;
  name: string;
  description: string;
};

export type TranscriptMessage = {
  id: string;
  turnId: string;
  sender: 'player' | 'character' | 'system';
  speaker: string;
  text: string;
  timestamp: number;
};

export type ProviderKind = 'mock' | 'novelai' | 'ollama';

export type ProviderSettings = {
  kind: ProviderKind;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
};

export type PerceptionResult = {
  input: string;
  sceneFacts: string[];
  visibleSubjects: string[];
  mentionedNames: string[];
  filtered: Array<{ value: string; reason: string }>;
};

export type ActiveCastResult = {
  primaryId: string;
  primaryName: string;
  active: Array<{ id: string; name: string; reason: string }>;
  mentionedOnly: string[];
};

export type ContextManifest = {
  compilerVersion: 1;
  includedSections: string[];
  includedMessages: number;
  estimatedInputTokens: number;
  characterId: string;
  personaId: string;
  scene: string;
};

export type CompiledContext = { prompt: string; manifest: ContextManifest };

export type SafeProviderMetadata = {
  provider: ProviderKind;
  model: string;
  endpoint: string;
  durationMs: number;
  requestId?: string;
  inputTokensEstimate?: number;
};

export type DiagnosticsSnapshot = {
  turnId: string;
  createdAt: number;
  inputEvent: TranscriptMessage;
  perception: PerceptionResult;
  activeCast: ActiveCastResult;
  relationshipBefore: unknown;
  relationshipAfter: unknown;
  relationshipEvent: unknown;
  compiledContext: CompiledContext;
  provider: SafeProviderMetadata;
  finalReply: string;
};
