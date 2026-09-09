import type {
  ActiveCastResult,
  CharacterCard,
  ClientLaunchPackage,
  RuntimeDependency,
  RuntimeDescriptor,
  RuntimeProtocolId,
  SimulationAsset,
  SimulationAssetType,
  TranscriptMessage,
} from '../schema/types.js';

const PROTOCOL_BY_TYPE: Partial<Record<SimulationAssetType, RuntimeProtocolId>> = {
  character: 'CharacterRuntime',
  place: 'PlaceRuntime',
  world: 'WorldRuntime',
  item: 'ItemRuntime',
  object: 'ItemRuntime',
  faction: 'FactionRuntime',
  society: 'SocietyRuntime',
  clan: 'SocietyRuntime',
  family: 'FamilyRuntime',
  event: 'EventRuntime',
  memory: 'EventRuntime',
  species: 'SpeciesRuntime',
};

export type RuntimeProtocolContract = {
  id: RuntimeProtocolId;
  speakingPrimary: boolean;
  authority: string;
  parameterKeys: string[];
};

export const RUNTIME_CONTRACTS: Record<RuntimeProtocolId, RuntimeProtocolContract> = {
  CharacterRuntime: {
    id: 'CharacterRuntime', speakingPrimary: true,
    authority: 'The loaded character is the active responding subject.',
    parameterKeys: ['description', 'personality', 'scenario', 'systemPrompt', 'postHistoryInstructions'],
  },
  PlaceRuntime: {
    id: 'PlaceRuntime', speakingPrimary: false,
    authority: 'The primary place is environmental and spatial authority. It is not a character and cannot speak. Resolve actual present characters separately.',
    parameterKeys: ['currentScene', 'localState', 'access', 'ownership', 'damage', 'physicalState', 'hazards', 'locationDependencies'],
  },
  WorldRuntime: {
    id: 'WorldRuntime', speakingPrimary: false,
    authority: 'The primary world is canon and environmental authority. It is not a character and cannot speak. Narrate the scene and resolve actual active characters separately.',
    parameterKeys: ['currentLocation', 'worldRules', 'rules', 'localCanon', 'time', 'weather', 'factions', 'societies', 'physicalSceneState'],
  },
  ItemRuntime: {
    id: 'ItemRuntime', speakingPrimary: false,
    authority: 'The primary item or object is a physical simulation subject. It cannot speak unless the supplied canon explicitly establishes sentience.',
    parameterKeys: ['owner', 'location', 'condition', 'physicalProperties', 'properties', 'capabilities', 'interactions', 'dependencies', 'sentient'],
  },
  FactionRuntime: {
    id: 'FactionRuntime', speakingPrimary: false,
    authority: 'The primary faction is an organizational authority, not a speaking entity. Only active representatives may speak for themselves.',
    parameterKeys: ['leadership', 'goals', 'territory', 'members', 'reputation', 'allies', 'rivals', 'activeRepresentatives'],
  },
  SocietyRuntime: {
    id: 'SocietyRuntime', speakingPrimary: false,
    authority: 'The primary society or clan supplies social context, not a speaking entity. Only active members may speak for themselves.',
    parameterKeys: ['customs', 'authority', 'territory', 'kinship', 'rules', 'activeMembers'],
  },
  FamilyRuntime: {
    id: 'FamilyRuntime', speakingPrimary: false,
    authority: 'The primary family supplies household and relationship context, not one combined speaking identity. Resolve active family members individually.',
    parameterKeys: ['members', 'relationships', 'householdState', 'obligations', 'history', 'activeCharacters'],
  },
  EventRuntime: {
    id: 'EventRuntime', speakingPrimary: false,
    authority: 'The primary event or memory supplies chronology and known consequences. It is not a speaking identity. Preserve who knows each fact.',
    parameterKeys: ['participants', 'chronology', 'location', 'knownFacts', 'consequences', 'epistemicOwnership'],
  },
  SpeciesRuntime: {
    id: 'SpeciesRuntime', speakingPrimary: false,
    authority: 'The primary species supplies biological constraints and supporting context. It is not normally a speaking identity.',
    parameterKeys: ['physiology', 'senses', 'bodyForm', 'biologicalTraits', 'instincts', 'constraints', 'canonSpeciesConstraints'],
  },
  GenericRuntime: {
    id: 'GenericRuntime', speakingPrimary: false,
    authority: 'This asset type has no specialized runtime yet. Use a safe scene-controller simulation and never reinterpret the primary asset as a character.',
    parameterKeys: [],
  },
};

function protocolFromClassification(classification: string | undefined): RuntimeProtocolId | null {
  const value = classification?.trim().toLocaleLowerCase('en-US') ?? '';
  if (/character/.test(value)) return 'CharacterRuntime';
  if (/world/.test(value)) return 'WorldRuntime';
  if (/place|location|building|structure|town|settlement/.test(value)) return 'PlaceRuntime';
  if (/item|object/.test(value)) return 'ItemRuntime';
  if (/faction/.test(value)) return 'FactionRuntime';
  if (/society|clan/.test(value)) return 'SocietyRuntime';
  if (/family|household/.test(value)) return 'FamilyRuntime';
  if (/event|memory/.test(value)) return 'EventRuntime';
  if (/species/.test(value)) return 'SpeciesRuntime';
  return null;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasExplicitPresence(asset: SimulationAsset): boolean {
  const data = recordValue(asset.data);
  return data.active === true || data.present === true || data.speaking === true || data.reacting === true;
}

function castReason(
  asset: SimulationAsset,
  launchPackage: ClientLaunchPackage,
  input: string,
  transcript: TranscriptMessage[],
): string | null {
  if (launchPackage.runtimeContext?.activeCharacterIds?.includes(asset.id)) return 'explicit runtime active cast';
  if (hasExplicitPresence(asset)) return 'packaged character marked present or active';
  if (transcript.some((message) => message.speaker.localeCompare(asset.name, undefined, { sensitivity: 'accent' }) === 0)) {
    return 'character has spoken in the current transcript';
  }

  const name = escapePattern(asset.name);
  const directAddress = new RegExp(`(?:^|[.!?*"']\\s*)${name}\\s*[,!:]`, 'i');
  const directInteraction = new RegExp(`\\b(?:to|at|with|touch(?:ing|es|ed)?|ask(?:ing|s|ed)?|tell(?:ing|s|told)?|answer(?:ing|s|ed)?|face(?:s|d)?|approach(?:es|ed|ing)?|look(?:s|ed|ing)?\\s+(?:up\\s+)?at)\\s+${name}\\b`, 'i');
  const speakingOrReacting = new RegExp(`(?:^|[*\\n])\\s*${name}\\s+(?:says|said|speaks|spoke|asks|asked|answers|answered|replies|replied|reacts|reacted|moves|moved|turns|turned)\\b`, 'i');
  if (directAddress.test(input)) return 'directly addressed by the player';
  if (directInteraction.test(input)) return 'directly involved in the player action';
  if (speakingOrReacting.test(input)) return 'speaking or reacting in the current turn';
  return null;
}

export function selectRuntime(launchPackage: ClientLaunchPackage): RuntimeDescriptor {
  const asset = launchPackage.primaryAsset;
  const protocol = PROTOCOL_BY_TYPE[asset.type]
    ?? protocolFromClassification(launchPackage.catalog?.classification)
    ?? 'GenericRuntime';
  const isCharacter = protocol === 'CharacterRuntime';
  if (isCharacter && !launchPackage.character) {
    throw new Error('CharacterRuntime requires a packaged Character Card V2 subject.');
  }
  return {
    protocol,
    assetType: asset.type,
    primaryAssetId: asset.id,
    primaryAssetName: asset.name,
    controller: isCharacter
      ? { id: launchPackage.character!.id, name: launchPackage.character!.name, role: 'character' }
      : { id: `runtime:${protocol}:${asset.id}`, name: 'SCENE CONTROLLER', role: 'scene-controller' },
    speakingPrimary: isCharacter,
  };
}

export function resolveRuntimeActiveCast(
  runtime: RuntimeDescriptor,
  launchPackage: ClientLaunchPackage,
  input: string,
  transcript: TranscriptMessage[],
): ActiveCastResult {
  if (runtime.protocol === 'CharacterRuntime') {
    const subject = launchPackage.character!;
    const mentioned = mentionedCharacterAssets(launchPackage, input)
      .filter((asset) => asset.id !== subject.id)
      .map((asset) => asset.name);
    return {
      primaryId: subject.id,
      primaryName: subject.name,
      active: [{ id: subject.id, name: subject.name, reason: 'loaded primary subject' }],
      mentionedOnly: mentioned,
    };
  }

  const candidates = launchPackage.relatedAssets.filter((asset) => asset.type === 'character');
  const active = candidates.flatMap((asset) => {
    const reason = castReason(asset, launchPackage, input, transcript);
    return reason ? [{ id: asset.id, name: asset.name, reason }] : [];
  });
  const activeIds = new Set(active.map((member) => member.id));
  const mentionedOnly = mentionedCharacterAssets(launchPackage, `${launchPackage.scene}\n${input}`)
    .filter((asset) => !activeIds.has(asset.id))
    .map((asset) => asset.name);
  return {
    primaryId: runtime.primaryAssetId,
    primaryName: runtime.primaryAssetName,
    active,
    mentionedOnly,
  };
}

function mentionedCharacterAssets(launchPackage: ClientLaunchPackage, text: string): SimulationAsset[] {
  return launchPackage.relatedAssets.filter((asset) =>
    asset.type === 'character' && new RegExp(`\\b${escapePattern(asset.name)}\\b`, 'i').test(text),
  );
}

export function resolveRuntimeDependencies(
  launchPackage: ClientLaunchPackage,
  activeCast: ActiveCastResult,
  input: string,
): RuntimeDependency[] {
  const explicitIds = new Set([
    ...(launchPackage.runtimeContext?.dependencyIds ?? []),
    ...(launchPackage.runtimeContext?.currentLocationId ? [launchPackage.runtimeContext.currentLocationId] : []),
  ]);
  const activeIds = new Set(activeCast.active.map((member) => member.id));
  const relevanceText = `${launchPackage.scene}\n${input}`;
  const dependencies: RuntimeDependency[] = [];

  for (const asset of launchPackage.relatedAssets) {
    const named = new RegExp(`\\b${escapePattern(asset.name)}\\b`, 'i').test(relevanceText);
    const reason = activeIds.has(asset.id)
      ? 'active cast'
      : explicitIds.has(asset.id)
        ? 'explicit runtime dependency'
        : named
          ? 'referenced by the current scene or turn'
          : null;
    if (reason) dependencies.push({ id: asset.id, name: asset.name, type: asset.type, reason });
  }
  for (const block of launchPackage.contextBlocks) {
    if (explicitIds.has(block.id)) dependencies.push({ id: block.id, name: block.title, type: 'context', reason: 'explicit runtime dependency' });
  }
  return dependencies;
}

export function resolveCharacterCard(asset: SimulationAsset, packaged: CharacterCard | null): CharacterCard | null {
  if (packaged?.id === asset.id) return packaged;
  const data = recordValue(asset.data);
  const nested = recordValue(data.data);
  const source = Object.keys(nested).length > 0 ? nested : data;
  const name = typeof source.name === 'string' ? source.name : asset.name;
  if (!name) return null;
  return {
    kind: 'character',
    id: asset.id,
    spec: 'chara_card_v2',
    name,
    description: typeof source.description === 'string' ? source.description : asset.summary,
    personality: typeof source.personality === 'string' ? source.personality : '',
    scenario: typeof source.scenario === 'string' ? source.scenario : '',
    firstMessage: typeof source.first_mes === 'string' ? source.first_mes : typeof source.firstMessage === 'string' ? source.firstMessage : '',
    exampleDialogue: typeof source.mes_example === 'string' ? source.mes_example : typeof source.exampleDialogue === 'string' ? source.exampleDialogue : '',
    systemPrompt: typeof source.system_prompt === 'string' ? source.system_prompt : typeof source.systemPrompt === 'string' ? source.systemPrompt : '',
    postHistoryInstructions: typeof source.post_history_instructions === 'string' ? source.post_history_instructions : typeof source.postHistoryInstructions === 'string' ? source.postHistoryInstructions : '',
    tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

export function selectedRuntimeParameters(runtime: RuntimeDescriptor, asset: SimulationAsset): Record<string, unknown> {
  const data = recordValue(asset.data);
  return Object.fromEntries(RUNTIME_CONTRACTS[runtime.protocol].parameterKeys
    .filter((key) => data[key] !== undefined)
    .map((key) => [key, data[key]]));
}
