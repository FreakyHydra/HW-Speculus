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
  sender: 'player' | 'character' | 'controller' | 'system';
  speaker: string;
  text: string;
  timestamp: number;
};

export type ProviderKind = 'mock' | 'orbis';

export type ProviderSettings = {
  kind: ProviderKind;
  model: string;
  temperature: number;
  maxTokens: number;
};

export type SimulationAssetType =
  | 'character'
  | 'world'
  | 'place'
  | 'item'
  | 'object'
  | 'faction'
  | 'society'
  | 'clan'
  | 'family'
  | 'event'
  | 'memory'
  | 'species'
  | 'other';

export type SimulationAsset = {
  id: string;
  revision: string;
  type: SimulationAssetType;
  name: string;
  summary: string;
  data: unknown;
};

export type SpeculusCatalogStatus = 'active' | 'archived' | 'retired' | 'sealed' | 'legacy';

export type SpeculusCatalogIdentity = {
  code: string;
  prefix: string;
  plate: string;
  generation: number;
  registryNumber: number;
  classRegistryNumber: number;
  classification: string;
  createdAt: string;
  status: SpeculusCatalogStatus;
};

export type ContextBlock = { id: string; title: string; content: string };

export type RuntimeEpistemicState = {
  sceneFacts?: string[];
  objectiveCanon?: string[];
  characterBeliefs?: Record<string, string[]>;
};

export type RuntimeLaunchContext = RuntimeEpistemicState & {
  activeCharacterIds?: string[];
  dependencyIds?: string[];
  currentLocationId?: string;
  localState?: unknown;
  physicalSceneState?: unknown;
  time?: unknown;
  weather?: unknown;
};

export type OrbisLaunchPackage = {
  version: 1;
  launchId: string;
  issuedAt: number;
  expiresAt: number;
  catalog?: SpeculusCatalogIdentity;
  primaryAsset: SimulationAsset;
  relatedAssets: SimulationAsset[];
  character: CharacterCard | null;
  persona: Persona;
  scene: string;
  contextBlocks: ContextBlock[];
  runtimeContext?: RuntimeLaunchContext;
  relationshipState: import('../relationships/schema.js').RelationshipState;
  model: string;
  generationGrant: string;
};

export type ClientLaunchPackage = Omit<OrbisLaunchPackage, 'generationGrant'>;

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

export type RuntimeProtocolId =
  | 'CharacterRuntime'
  | 'PlaceRuntime'
  | 'WorldRuntime'
  | 'ItemRuntime'
  | 'FactionRuntime'
  | 'SocietyRuntime'
  | 'FamilyRuntime'
  | 'EventRuntime'
  | 'SpeciesRuntime'
  | 'GenericRuntime';

export type RuntimeController = {
  id: string;
  name: string;
  role: 'character' | 'scene-controller';
};

export type RuntimeDescriptor = {
  protocol: RuntimeProtocolId;
  assetType: SimulationAssetType;
  primaryAssetId: string;
  primaryAssetName: string;
  controller: RuntimeController;
  speakingPrimary: boolean;
};

export type RuntimeDependency = {
  id: string;
  name: string;
  type: SimulationAssetType | 'context';
  reason: string;
};

export type RuntimeDiagnostics = {
  selectedProtocol: RuntimeProtocolId;
  primaryAsset: { id: string; name: string; type: SimulationAssetType };
  sceneController: RuntimeController;
  includedDependencies: RuntimeDependency[];
  relationshipTargets: Array<{ id: string; name: string }>;
};

export type ContextManifest = {
  compilerVersion: 1 | 2;
  includedSections: string[];
  includedMessages: number;
  estimatedInputTokens: number;
  characterId: string;
  personaId: string;
  scene: string;
  runtimeProtocol?: RuntimeProtocolId;
  dependencyIds?: string[];
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
  runtime?: RuntimeDiagnostics;
  relationshipBefore: unknown;
  relationshipAfter: unknown;
  relationshipEvent: unknown;
  compiledContext: CompiledContext;
  provider: SafeProviderMetadata;
  finalReply: string;
};
