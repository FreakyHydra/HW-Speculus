import { compileContext, responseTokenLimit } from '../runtime/generation/compile-context';
import { normalizeRoleplayReply } from '../runtime/generation/format';
import { resolveActiveCast, resolvePerception } from '../runtime/generation/perception';
import { commitRelationshipEvent, getRelationship, removeRelationshipTurns } from '../runtime/relationships/core';
import { heuristicRelationshipScorer, type RelationshipScorer } from '../runtime/relationships/evaluator';
import type { ProviderAdapter } from '../runtime/providers/types';
import type { TranscriptMessage } from '../runtime/schema/types';
import type { SimulatorSession } from './session';
import { createBeatPlan } from '../runtime/brain/planning/beat-plan';
import { createBrainConfig, normalizeBrainConfig } from '../runtime/brain/policies/core';
import { resolveTargetProtocol } from '../runtime/brain/protocols/target';
import { assertDraftAccepted, validateDraft } from '../runtime/brain/validation/draft';
import { getResponseCalibration } from '../runtime/generation/compile-context';

function requireReady(session: SimulatorSession) {
  if (!session.character) throw new Error('Load a Character Card V2 subject first.');
  if (!session.persona) throw new Error('Load or create a persona first.');
  return { character: session.character, persona: session.persona };
}

function hasCharacterPrimary(session: SimulatorSession): boolean {
  return session.launchPackage?.primaryAsset.type ? session.launchPackage.primaryAsset.type === 'character' : true;
}

export async function runTurn(
  session: SimulatorSession,
  input: string,
  provider: ProviderAdapter,
  options: { rerollCharacterId?: string; scorer?: RelationshipScorer } = {},
): Promise<SimulatorSession> {
  const cleanInput = input.trim();
  if (!cleanInput) throw new Error('Enter a player turn first.');
  const { character, persona } = requireReady(session);
  const characterPrimary = hasCharacterPrimary(session);
  const rerollIndex = options.rerollCharacterId
    ? session.transcript.findIndex((message) => message.id === options.rerollCharacterId && message.sender === 'character')
    : -1;
  const isReroll = rerollIndex >= 0;
  const previousReply = isReroll ? session.transcript[rerollIndex]?.text : undefined;
  const turnNumber = isReroll ? Number(session.transcript[rerollIndex].turnId.split(':').at(-1)) || session.nextTurnNumber : session.nextTurnNumber;
  const turnId = isReroll ? session.transcript[rerollIndex].turnId : `turn:${turnNumber}`;
  const characterMessageId = isReroll ? session.transcript[rerollIndex].id : `${turnId}:character`;
  const timestamp = Date.now();
  const playerMessage: TranscriptMessage = isReroll
    ? session.transcript.slice(0, rerollIndex).reverse().find((message) => message.sender === 'player') ?? {
      id: `${turnId}:player`, turnId, sender: 'player', speaker: persona.name, text: cleanInput, timestamp,
    }
    : { id: `${turnId}:player`, turnId, sender: 'player', speaker: persona.name, text: cleanInput, timestamp };
  const transcriptBeforeReply = isReroll
    ? session.transcript.slice(0, rerollIndex)
    : [...session.transcript, playerMessage];
  const relationshipBase = isReroll
    ? removeRelationshipTurns(session.relationships, character.id, persona.id, [characterMessageId])
    : session.relationships;
  const relationshipBefore = getRelationship(relationshipBase, character.id, persona.id);
  const targetProtocol = resolveTargetProtocol(session.launchPackage);
  const brain = session.brain
    ? normalizeBrainConfig(session.brain, targetProtocol, session.brain.responseMode)
    : createBrainConfig(targetProtocol, getResponseCalibration());
  const beatPlan = createBeatPlan(brain.targetProtocol, brain.responseMode, playerMessage.text);
  const perception = resolvePerception(character, persona, session.scene, playerMessage.text);
  const activeCast = resolveActiveCast(character, playerMessage.text);
  const compiledContext = compileContext({
    character, persona, scene: session.scene, transcript: transcriptBeforeReply,
    relationship: relationshipBefore, reroll: isReroll,
    influence: session.influence,
    launchPackage: session.launchPackage,
    brain,
    beatPlan,
  });
  const providerResult = await provider.generate({
    prompt: compiledContext.prompt,
    model: session.settings.provider.model,
    temperature: session.settings.provider.temperature,
    maxTokens: responseTokenLimit(session.settings.provider.maxTokens, brain.responseMode),
    reroll: isReroll,
  });
  const reply = normalizeRoleplayReply(
    providerResult.text,
    playerMessage.text,
    character.name,
    persona.name,
    characterPrimary ? 'character' : 'narrator',
  );
  const validation = validateDraft({ reply, playerName: persona.name, provider: providerResult.metadata, beatPlan });
  assertDraftAccepted(validation);
  const characterMessage: TranscriptMessage = {
    id: characterMessageId, turnId, sender: 'character', speaker: character.name, text: reply, timestamp: Date.now(),
  };

  let relationships = session.relationships;
  let relationshipAfter = relationshipBefore;
  let relationshipEvent: unknown = null;
  if (characterPrimary) {
    const evaluation = (options.scorer ?? heuristicRelationshipScorer).evaluate({
      playerMessage: playerMessage.text,
      characterReply: reply,
      previousScore: relationshipBefore.score,
    });
    relationships = commitRelationshipEvent(relationshipBase, {
      characterId: character.id,
      personaId: persona.id,
      turnId: characterMessage.id,
      delta: evaluation.delta,
      reason: evaluation.reason,
      dimensionDeltas: evaluation.dimensionDeltas,
      createdAt: characterMessage.timestamp,
    });
    relationshipAfter = getRelationship(relationships, character.id, persona.id);
    relationshipEvent = relationshipAfter.events.find((event) => event.turnId === characterMessage.id) ?? null;
  }

  const transcript = isReroll
    ? [...session.transcript.slice(0, rerollIndex), characterMessage, ...session.transcript.slice(rerollIndex + 1)]
    : [...transcriptBeforeReply, characterMessage];
  const diagnostics = session.diagnostics.filter((entry) => entry.turnId !== characterMessage.id);
  diagnostics.push({
    turnId: characterMessage.id,
    createdAt: Date.now(),
    inputEvent: playerMessage,
    perception,
    activeCast,
    relationshipBefore: characterPrimary ? relationshipBefore : { status: 'not applicable to non-character primary asset' },
    relationshipAfter: characterPrimary ? relationshipAfter : { status: 'not applicable to non-character primary asset' },
    relationshipEvent,
    compiledContext,
    provider: providerResult.metadata,
    brain: { config: brain, beatPlan, validation },
    finalReply: reply,
    previousReply,
  });
  return {
    ...session,
    transcript,
    relationships,
    brain,
    diagnostics,
    nextTurnNumber: isReroll ? session.nextTurnNumber : session.nextTurnNumber + 1,
    updatedAt: Date.now(),
  };
}

export function deleteCharacterTurn(session: SimulatorSession, messageId: string): SimulatorSession {
  const { character, persona } = requireReady(session);
  const message = session.transcript.find((candidate) => candidate.id === messageId && candidate.sender === 'character');
  if (!message) return session;
  return {
    ...session,
    transcript: session.transcript.filter((candidate) => candidate.turnId !== message.turnId),
    relationships: hasCharacterPrimary(session)
      ? removeRelationshipTurns(session.relationships, character.id, persona.id, [message.id])
      : session.relationships,
    diagnostics: session.diagnostics.filter((entry) => entry.turnId !== message.id),
    updatedAt: Date.now(),
  };
}
