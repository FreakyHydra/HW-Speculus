import { relationshipLabel, type getRelationship } from '../relationships/core.js';
import {
  resolveCharacterCard,
  RUNTIME_CONTRACTS,
  selectedRuntimeParameters,
} from '../protocols/router.js';
import type {
  ActiveCastResult,
  ClientLaunchPackage,
  CompiledContext,
  Persona,
  RuntimeDependency,
  RuntimeDescriptor,
  TranscriptMessage,
} from '../schema/types.js';
import { estimateTokens } from './compile-context.js';
import { stripModelControlTokens } from './format.js';

type Relationship = ReturnType<typeof getRelationship>;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function compileRuntimeContext(input: {
  runtime: RuntimeDescriptor;
  launchPackage: ClientLaunchPackage;
  persona: Persona;
  scene: string;
  transcript: TranscriptMessage[];
  activeCast: ActiveCastResult;
  dependencies: RuntimeDependency[];
  relationships: Map<string, Relationship>;
  reroll?: boolean;
}): CompiledContext {
  if (input.runtime.protocol === 'CharacterRuntime') {
    throw new Error('CharacterRuntime must use the compatibility character compiler.');
  }
  const { launchPackage, runtime, persona } = input;
  const selectedIds = new Set(input.dependencies.map((dependency) => dependency.id));
  const selectedAssets = launchPackage.relatedAssets.filter((asset) => selectedIds.has(asset.id));
  const selectedBlocks = launchPackage.contextBlocks.filter((block) => selectedIds.has(block.id));
  const runtimeContext = launchPackage.runtimeContext;
  const primaryParameters = selectedRuntimeParameters(runtime, launchPackage.primaryAsset);
  const sections: Array<[string, string]> = [
    ['system', [
      'You are the scene narrator and controller in a controlled simulation.',
      RUNTIME_CONTRACTS[runtime.protocol].authority,
      `The primary asset is ${launchPackage.primaryAsset.name} (${launchPackage.primaryAsset.type}). Never use it as a speaking character identity.`,
      'Never write the player persona\'s actions, thoughts, decisions, or dialogue.',
      'Do not invent missing canon, prior events, injuries, restraints, authority, relationships, possessions, or scene state.',
      'Objective canon, physical scene facts, and individual character beliefs are separate. A belief does not become objective reality merely because a character holds it.',
    ].join('\n')],
    ['runtime', [
      `Selected protocol: ${runtime.protocol}`,
      `Scene controller: ${runtime.controller.name}`,
      `Controller role: ${runtime.controller.role}`,
    ].join('\n')],
    ['primary-asset', [
      `Name: ${launchPackage.primaryAsset.name}`,
      `Type: ${launchPackage.primaryAsset.type}`,
      `Source revision: ${launchPackage.primaryAsset.revision}`,
      launchPackage.primaryAsset.summary && `Summary: ${launchPackage.primaryAsset.summary}`,
      Object.keys(primaryParameters).length > 0 && `Runtime parameters:\n${json(primaryParameters)}`,
    ].filter(Boolean).join('\n')],
    ['persona', `Player identity/role: ${persona.name}\n${persona.description || 'No additional persona description.'}`],
    ['scene', input.scene.trim() || 'No current scene was supplied. Do not invent one; ask or respond only to established information.'],
  ];

  if (runtimeContext) {
    sections.push(['epistemic-state', [
      `Objective scene facts:\n${json(runtimeContext.sceneFacts ?? [])}`,
      `Objective canon:\n${json(runtimeContext.objectiveCanon ?? [])}`,
      `Character beliefs keyed by character ID:\n${json(runtimeContext.characterBeliefs ?? {})}`,
      runtimeContext.localState !== undefined && `Local state:\n${json(runtimeContext.localState)}`,
      runtimeContext.physicalSceneState !== undefined && `Physical scene state:\n${json(runtimeContext.physicalSceneState)}`,
      runtimeContext.time !== undefined && `Time:\n${json(runtimeContext.time)}`,
      runtimeContext.weather !== undefined && `Weather:\n${json(runtimeContext.weather)}`,
    ].filter(Boolean).join('\n\n')]);
  }

  const activeCards = input.activeCast.active.map((member) => {
    const asset = launchPackage.relatedAssets.find((candidate) => candidate.id === member.id);
    if (!asset) return `${member.name} (${member.id}): active, but no packaged character record was supplied.`;
    const card = resolveCharacterCard(asset, launchPackage.character);
    return [
      `${member.name} (${member.id})`,
      `Activation reason: ${member.reason}`,
      card?.description && `Description: ${card.description}`,
      card?.personality && `Personality: ${card.personality}`,
      card?.systemPrompt && `Character instructions: ${card.systemPrompt}`,
      card?.postHistoryInstructions && `Post-history instructions: ${card.postHistoryInstructions}`,
    ].filter(Boolean).join('\n');
  });
  sections.push(['active-cast', activeCards.length > 0
    ? `${activeCards.join('\n\n')}\n\nOnly these resolved characters may act, speak, or react as active cast in this turn.`
    : 'No active character was resolved. Narrate only established environmental or physical results; do not invent a speaker.']);

  if (selectedAssets.length > 0 || selectedBlocks.length > 0) {
    sections.push(['dependencies', [
      ...selectedAssets.map((asset) => `${asset.name} (${asset.type}, ${asset.id}):\n${asset.summary}\n${json(asset.data)}`),
      ...selectedBlocks.map((block) => `${block.title} (${block.id}):\n${block.content}`),
    ].join('\n\n')]);
  }

  const relationshipLines = input.activeCast.active.map((member) => {
    const relationship = input.relationships.get(member.id);
    return relationship
      ? `${member.name} (${member.id}) -> ${persona.name}: ${relationshipLabel(relationship.score)} (${relationship.score})`
      : `${member.name} (${member.id}) -> ${persona.name}: no relationship record supplied`;
  });
  sections.push(['relationships', relationshipLines.length > 0
    ? `${relationshipLines.join('\n')}\nRelationships belong to the listed character IDs only, never to the primary ${launchPackage.primaryAsset.type}.`
    : `No character relationship target is active. Do not attach relationship state to ${launchPackage.primaryAsset.name}.`]);
  sections.push(['clock', `Session timestamp: ${new Date(input.transcript.at(-1)?.timestamp ?? Date.now()).toISOString()}`]);
  sections.push(['format', [
    'Roleplay markup is mandatory.',
    'Spoken dialogue uses "double quotes". Actions and narration use *single asterisks*. Inner voice uses [square brackets].',
    'Keep action, dialogue, and thought inline when they belong to one natural paragraph.',
  ].join('\n')]);
  if (input.reroll) sections.push(['reroll', 'Generate a genuinely different reaction from the same preceding player turn while preserving canon and continuity.']);
  const history = input.transcript.slice(-20).map((message) => `${message.speaker}: ${stripModelControlTokens(message.text).trim()}`).join('\n');
  sections.push(['history', history || '(no prior messages)']);
  const prompt = `${sections.map(([name, value]) => `<${name}>\n${value}\n</${name}>`).join('\n\n')}\n\n<assistant>\n${runtime.controller.name}:`;

  return {
    prompt,
    manifest: {
      compilerVersion: 2,
      includedSections: sections.map(([name]) => name),
      includedMessages: Math.min(20, input.transcript.length),
      estimatedInputTokens: estimateTokens(prompt),
      characterId: runtime.controller.id,
      personaId: persona.id,
      scene: input.scene,
      runtimeProtocol: runtime.protocol,
      dependencyIds: input.dependencies.map((dependency) => dependency.id),
    },
  };
}
