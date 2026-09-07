import { relationshipLabel, type getRelationship } from '../relationships/core';
import type { CharacterCard, ClientLaunchPackage, CompiledContext, Persona, TranscriptMessage } from '../schema/types';

type Relationship = ReturnType<typeof getRelationship>;

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

export function compileContext(input: {
  character: CharacterCard;
  persona: Persona;
  scene: string;
  transcript: TranscriptMessage[];
  relationship: Relationship;
  launchPackage?: ClientLaunchPackage | null;
  reroll?: boolean;
}): CompiledContext {
  const { character, persona, relationship } = input;
  const sections: Array<[string, string]> = [
    ['system', [
      'You are the loaded roleplay subject in a controlled character simulation.',
      `Write only ${character.name}'s next response. Never write the player's actions, thoughts, decisions, or dialogue.`,
      'Established facts and the loaded subject card outrank improvisation.',
    ].join('\n')],
    ['character', [
      `Name: ${character.name}`,
      character.description && `Description: ${character.description}`,
      character.personality && `Personality: ${character.personality}`,
      character.systemPrompt && `Card system prompt: ${character.systemPrompt}`,
      character.postHistoryInstructions && `Post-history instructions: ${character.postHistoryInstructions}`,
      character.exampleDialogue && `Example dialogue:\n${character.exampleDialogue}`,
    ].filter(Boolean).join('\n')],
    ['persona', `Player identity: ${persona.name}\n${persona.description || 'No additional persona description.'}`],
    ['scene', input.scene.trim() || character.scenario || 'An undefined testing chamber.'],
    ['relationship', `Current relationship: ${relationshipLabel(relationship.score)} (${relationship.score}). This is context, not a command to force affection or hostility.`],
    ['clock', `Session timestamp: ${new Date(input.transcript.at(-1)?.timestamp ?? Date.now()).toISOString()}`],
    ['format', [
      'Roleplay markup is mandatory.',
      'Spoken dialogue uses "double quotes". Actions and narration use *single asterisks*. Inner voice uses [square brackets].',
      'Keep action, dialogue, and thought inline when they belong to one natural paragraph.',
    ].join('\n')],
  ];
  if (input.launchPackage) {
    sections.splice(2, 0, ['orbis-asset', [
      `Primary asset type: ${input.launchPackage.primaryAsset.type}`,
      `Primary asset: ${input.launchPackage.primaryAsset.name}`,
      `Source revision: ${input.launchPackage.primaryAsset.revision}`,
      input.launchPackage.primaryAsset.summary,
      `Packaged data:\n${JSON.stringify(input.launchPackage.primaryAsset.data, null, 2)}`,
      ...input.launchPackage.contextBlocks.map((block) => `${block.title}:\n${block.content}`),
    ].filter(Boolean).join('\n\n')]);
  }
  if (input.reroll) sections.push(['reroll', 'Generate a genuinely different reaction from the same preceding player turn while preserving canon and continuity.']);
  const history = input.transcript.slice(-20).map((message) => `${message.speaker}: ${message.text}`).join('\n');
  sections.push(['history', history || '(no prior messages)']);
  const prompt = `${sections.map(([name, value]) => `<${name}>\n${value}\n</${name}>`).join('\n\n')}\n\n<assistant>\n${character.name}:`;
  return {
    prompt,
    manifest: {
      compilerVersion: 1,
      includedSections: sections.map(([name]) => name),
      includedMessages: Math.min(20, input.transcript.length),
      estimatedInputTokens: estimateTokens(prompt),
      characterId: character.id,
      personaId: persona.id,
      scene: input.scene,
    },
  };
}
