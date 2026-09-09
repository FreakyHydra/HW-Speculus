import { relationshipLabel, type getRelationship } from '../relationships/core';
import type { CharacterCard, ClientLaunchPackage, CompiledContext, Persona, ResponseLengthMode, TranscriptMessage } from '../schema/types';
import { stripModelControlTokens } from './format';

type Relationship = ReturnType<typeof getRelationship>;

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function responseLengthInstruction(mode: ResponseLengthMode): string {
  if (mode === 'concise') {
    return [
      'Response length: CONCISE.',
      'Usually answer in 1-2 compact paragraphs.',
      'Resolve only the immediate reaction to the player turn. Do not continue through multiple scene beats, time skips, or extra voluntary actions.',
      'Hand control back to the player as soon as the immediate beat is complete.',
    ].join('\n');
  }
  if (mode === 'long') {
    return [
      'Response length: LONG.',
      'Use richer sensory, emotional, and character detail when the scene supports it.',
      'Longer does not mean advancing the plot without the player: remain inside the current beat unless the player clearly set up a transition.',
      'Prefer depth over stacking several consecutive scene beats.',
    ].join('\n');
  }
  if (mode === 'normal') {
    return [
      'Response length: NORMAL.',
      'Aim for a moderate response, usually 2-4 paragraphs.',
      'Cover one clear reaction and, when natural, one immediate follow-up. Do not run several scene beats ahead of the player.',
      'Stop at a natural handoff point for the player.',
    ].join('\n');
  }
  return [
    'Response length: ADAPTIVE.',
    'Scale detail and length to the player turn and the importance of the moment instead of defaulting to a long answer.',
    'A short greeting, gesture, or simple action normally deserves 1-2 compact paragraphs. A complex action or important scene may deserve 2-5 paragraphs.',
    'Do not continue through multiple scene beats just because token budget remains. Complete the immediate consequence, then hand control back to the player.',
  ].join('\n');
}

function personaInstruction(persona: Persona): string {
  const identity = [`Player identity: ${persona.name}`, persona.description || 'No additional persona description.'];
  if (persona.pronouns) {
    identity.push(`Selected player pronouns: ${persona.pronouns}. Use these consistently whenever referring to the player in third person.`);
  } else {
    identity.push(`Player pronouns are unset. Do not infer or invent gender or pronouns, and do not default to singular they/them. Use ${persona.name} or second-person "you" instead.`);
  }
  return identity.join('\n');
}

export function compileContext(input: {
  character: CharacterCard;
  persona: Persona;
  scene: string;
  transcript: TranscriptMessage[];
  relationship: Relationship;
  responseLength?: ResponseLengthMode;
  launchPackage?: ClientLaunchPackage | null;
  reroll?: boolean;
}): CompiledContext {
  const { character, persona, relationship } = input;
  const responseLength = input.responseLength ?? input.launchPackage?.responseLength ?? 'adaptive';
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
    ['persona', personaInstruction(persona)],
    ['scene', input.scene.trim() || character.scenario || 'An undefined testing chamber.'],
    ['relationship', `Current relationship: ${relationshipLabel(relationship.score)} (${relationship.score}). This is context, not a command to force affection or hostility.`],
    ['clock', `Session timestamp: ${new Date(input.transcript.at(-1)?.timestamp ?? Date.now()).toISOString()}`],
    ['pacing', responseLengthInstruction(responseLength)],
    ['format', [
      'Roleplay markup is mandatory.',
      'Spoken dialogue uses "double quotes". Actions and narration use *single asterisks*. Inner voice uses [square brackets].',
      'Keep action, dialogue, and thought inline when they belong to one natural paragraph.',
    ].join('\n')],
  ];
  if (input.launchPackage) {
    const additions: Array<[string, string]> = [];
    const catalog = input.launchPackage.catalog;
    if (catalog) {
      additions.push(['registry', [
        `Canonical Speculus identity: ${catalog.code}`,
        `Internal global registry sequence: ${catalog.registryNumber}`,
        `Internal ${catalog.classification.toLocaleLowerCase('en-US')} sequence: ${catalog.classRegistryNumber}`,
        `Registered creation time: ${catalog.createdAt}`,
        'Treat this registry identity as immutable. It identifies the same authored entity even if its display name, aliases, relationships, or location change later.',
        'Registry identifiers are runtime metadata, not in-world knowledge. Do not mention them in roleplay unless the player explicitly makes them part of the scene.',
      ].join('\n')]);
    }
    additions.push(['orbis-asset', [
      `Primary asset type: ${input.launchPackage.primaryAsset.type}`,
      `Primary asset: ${input.launchPackage.primaryAsset.name}`,
      `Source revision: ${input.launchPackage.primaryAsset.revision}`,
      input.launchPackage.primaryAsset.summary,
      `Packaged data:\n${JSON.stringify(input.launchPackage.primaryAsset.data, null, 2)}`,
      ...input.launchPackage.contextBlocks.map((block) => `${block.title}:\n${block.content}`),
    ].filter(Boolean).join('\n\n')]);
    sections.splice(2, 0, ...additions);
  }
  if (input.reroll) sections.push(['reroll', 'Generate a genuinely different reaction from the same preceding player turn while preserving canon and continuity.']);
  const history = input.transcript.slice(-20).map((message) => `${message.speaker}: ${stripModelControlTokens(message.text).trim()}`).join('\n');
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
