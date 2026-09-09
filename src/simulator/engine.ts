import { compileContext } from '../runtime/generation/compile-context';
import { compileRuntimeContext } from '../runtime/generation/compile-runtime-context';
import { normalizeRoleplayReply } from '../runtime/generation/format';
import { resolveActiveCast, resolvePerception } from '../runtime/generation/perception';
import { resolveRuntimeActiveCast, resolveRuntimeDependencies } from '../runtime/protocols/router';
import { commitRelationshipEvent, getRelationship, removeRelationshipTurns } from '../runtime/relationships/core';
import { heuristicRelationshipScorer, type RelationshipScorer } from '../runtime/relationships/evaluator';
import type { ProviderAdapter } from '../runtime/providers/types';
import type { TranscriptMessage } from '../runtime/schema/types';
import type { SimulatorSession } from './session';

function requireReady(session: SimulatorSession) {
  if (!session.persona) throw new Error('Load or create a persona first.');
  if (session.runtime && session.launchPackage) return { runtime: session.runtime, launchPackage: session.launchPackage, character: session.character, persona: session.persona };
  if (!session.character) throw new Error('Load a Character Card V2 subject first.');
  return { runtime: null, launchPackage: null, character: session.character, persona: session.persona };
}

export async function runTurn(
  session: SimulatorSession,
  input: string,
  provider: ProviderAdapter,
  options: { rerollCharacterId?: string; scorer?: RelationshipScorer } = {},
): Promise<SimulatorSession> {
  const cleanInput = input.trim();
  if (!cleanInput) throw new Error('Enter a player turn first.');
  const { runtime, launchPackage, character, persona } = requireReady(session);
  const isCharacterRuntime = !runtime || runtime.protocol === 'CharacterRuntime';
  if (isCharacterRuntime && !character) throw new Error('CharacterRuntime requires a loaded Character Card V2 subject.');
  const rerollIndex = options.rerollCharacterId
    ? session.transcript.findIndex((message) => message.id === options.rerollCharacterId && (message.sender === 'character' || message.sender === 'controller'))
    : -1;
  const isReroll = rerollIndex >= 0;
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
  const activeCast = isCharacterRuntime
    ? resolveActiveCast(character!, playerMessage.text)
    : resolveRuntimeActiveCast(runtime!, launchPackage!, playerMessage.text, transcriptBeforeReply);
  const dependencies = runtime && launchPackage
    ? resolveRuntimeDependencies(launchPackage, activeCast, playerMessage.text)
    : [];
  const relationshipTargets = activeCast.active.map(({ id, name }) => ({ id, name }));
  const relationshipBeforeById = new Map(relationshipTargets.map((target) => [target.id, getRelationship(session.relationships, target.id, persona.id)]));
  const relationshipBefore = isCharacterRuntime
    ? relationshipBeforeById.get(character!.id)!
    : Object.fromEntries(relationshipBeforeById);
  const perception = isCharacterRuntime
    ? resolvePerception(character!, persona, session.scene, playerMessage.text)
    : {
      input: playerMessage.text,
      sceneFacts: launchPackage!.runtimeContext?.sceneFacts ?? [session.scene.trim() || 'No scene description was supplied.'],
      visibleSubjects: activeCast.active.map((member) => member.name),
      mentionedNames: activeCast.mentionedOnly,
      filtered: activeCast.mentionedOnly.map((value) => ({ value, reason: 'Mention alone does not activate a character.' })),
    };
  const compiledContext = isCharacterRuntime
    ? compileContext({
      character: character!, persona, scene: session.scene, transcript: transcriptBeforeReply,
      relationship: relationshipBeforeById.get(character!.id)!, reroll: isReroll,
      launchPackage: session.launchPackage,
    })
    : compileRuntimeContext({
      runtime: runtime!, launchPackage: launchPackage!, persona, scene: session.scene,
      transcript: transcriptBeforeReply, activeCast, dependencies,
      relationships: relationshipBeforeById, reroll: isReroll,
    });
  const providerResult = await provider.generate({
    prompt: compiledContext.prompt,
    model: session.settings.provider.model,
    temperature: session.settings.provider.temperature,
    maxTokens: session.settings.provider.maxTokens,
    reroll: isReroll,
  });
  const responseIdentity = isCharacterRuntime ? character!.name : runtime!.controller.name;
  const reply = normalizeRoleplayReply(providerResult.text, playerMessage.text, responseIdentity, persona.name);
  const characterMessage: TranscriptMessage = {
    id: characterMessageId, turnId, sender: isCharacterRuntime ? 'character' : 'controller', speaker: responseIdentity, text: reply, timestamp: Date.now(),
  };
  let relationships = session.relationships;
  for (const target of relationshipTargets) {
    const before = relationshipBeforeById.get(target.id)!;
    const evaluation = (options.scorer ?? heuristicRelationshipScorer).evaluate({
      playerMessage: playerMessage.text,
      characterReply: reply,
      previousScore: before.score,
    });
    relationships = commitRelationshipEvent(relationships, {
      characterId: target.id,
      personaId: persona.id,
      turnId: characterMessage.id,
      delta: evaluation.delta,
      reason: evaluation.reason,
      dimensionDeltas: evaluation.dimensionDeltas,
      createdAt: characterMessage.timestamp,
    });
  }
  const relationshipAfterById = new Map(relationshipTargets.map((target) => [target.id, getRelationship(relationships, target.id, persona.id)]));
  const relationshipAfter = isCharacterRuntime
    ? relationshipAfterById.get(character!.id)!
    : Object.fromEntries(relationshipAfterById);
  const relationshipEvent = isCharacterRuntime
    ? relationshipAfterById.get(character!.id)?.events.find((event) => event.turnId === characterMessage.id) ?? null
    : Object.fromEntries([...relationshipAfterById].map(([id, record]) => [id, record.events.find((event) => event.turnId === characterMessage.id) ?? null]));
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
    runtime: runtime && launchPackage ? {
      selectedProtocol: runtime.protocol,
      primaryAsset: { id: launchPackage.primaryAsset.id, name: launchPackage.primaryAsset.name, type: launchPackage.primaryAsset.type },
      sceneController: runtime.controller,
      includedDependencies: dependencies,
      relationshipTargets,
    } : undefined,
    relationshipBefore,
    relationshipAfter,
    relationshipEvent,
    compiledContext,
    provider: providerResult.metadata,
    finalReply: reply,
  });
  return {
    ...session,
    transcript,
    relationships,
    diagnostics,
    nextTurnNumber: isReroll ? session.nextTurnNumber : session.nextTurnNumber + 1,
    updatedAt: Date.now(),
  };
}

export function deleteCharacterTurn(session: SimulatorSession, messageId: string): SimulatorSession {
  const { character, persona } = requireReady(session);
  const message = session.transcript.find((candidate) => candidate.id === messageId && (candidate.sender === 'character' || candidate.sender === 'controller'));
  if (!message) return session;
  const diagnostic = session.diagnostics.find((entry) => entry.turnId === message.id);
  const targetIds = diagnostic?.runtime?.relationshipTargets.map((target) => target.id) ?? (character ? [character.id] : []);
  const relationships = targetIds.reduce(
    (state, characterId) => removeRelationshipTurns(state, characterId, persona.id, [message.id]),
    session.relationships,
  );
  return {
    ...session,
    transcript: session.transcript.filter((candidate) => candidate.turnId !== message.turnId),
    relationships,
    diagnostics: session.diagnostics.filter((entry) => entry.turnId !== message.id),
    updatedAt: Date.now(),
  };
}
