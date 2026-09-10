import { relationshipLabel, type getRelationship } from '../relationships/core';
import type { CharacterCard, ClientLaunchPackage, CompiledContext, Persona, TranscriptMessage } from '../schema/types';
import { redactPrivatePlayerKnowledge, stripModelControlTokens } from './format';

type Relationship = ReturnType<typeof getRelationship>;
export type ResponseCalibration = 'concise' | 'normal' | 'long' | 'adaptive';

const RESPONSE_CALIBRATION_KEY = 'speculus-response-calibration';

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

export function getResponseCalibration(): ResponseCalibration {
  if (typeof window === 'undefined') return 'adaptive';
  const value = window.localStorage.getItem(RESPONSE_CALIBRATION_KEY);
  return value === 'concise' || value === 'normal' || value === 'long' || value === 'adaptive' ? value : 'adaptive';
}

export function responseTokenLimit(defaultMax: number): number {
  const mode = getResponseCalibration();
  // Concise is a pacing preference, not a truncation mechanism. Give the model the
  // normal provider budget so it can finish the current sentence/beat naturally.
  if (mode === 'concise') return defaultMax;
  if (mode === 'normal') return Math.min(Math.max(defaultMax, 550), 900);
  if (mode === 'long') return Math.max(defaultMax, 1400);
  return defaultMax;
}

function responseInstruction(mode: ResponseCalibration): string {
  if (mode === 'concise') return 'Response calibration: CONCISE. Keep the reply very short: usually one immediate action/reaction beat and no more than 1-2 short paragraphs. Do not add recap, extra scene development, boilerplate questions, weather/time summaries, or multiple new beats. Always finish the current sentence and natural response beat; never cut off mid-sentence just to stay short.';
  if (mode === 'normal') return 'Response calibration: NORMAL. Prefer roughly 2-4 moderate paragraphs with no unnecessary repetition.';
  if (mode === 'long') return 'Response calibration: LONG. Allow a detailed response when useful, but remain focused on the current scene.';
  return 'Response calibration: ADAPTIVE. Match response length to the immediate scene and player input; do not become verbose without a reason.';
}

export function compileContext(input: {
  character: CharacterCard;
  persona: Persona;
  scene: string;
  transcript: TranscriptMessage[];
  relationship: Relationship;
  influence?: { tags?: string[]; freeform?: string };
  launchPackage?: ClientLaunchPackage | null;
  reroll?: boolean;
}): CompiledContext {
  const { character, persona, relationship } = input;
  const primaryType = input.launchPackage?.primaryAsset.type ?? 'character';
  const primaryName = input.launchPackage?.primaryAsset.name ?? character.name;
  const isCharacterSubject = primaryType === 'character';
  const calibration = getResponseCalibration();
  const systemRules = isCharacterSubject
    ? [
      'You are the loaded roleplay subject in a controlled character simulation.',
      `Write only ${character.name}'s next response. Never write the player's actions, thoughts, decisions, or dialogue.`,
    ]
    : [
      'You are a neutral simulation narrator observing a non-character Orbis asset.',
      `The primary asset is explicitly typed as ${primaryType}: ${primaryName}.`,
      `A ${primaryType} is not a character. Never give ${primaryName} speech, thoughts, emotions, intentions, relationships, or autonomous character behavior unless the packaged canon explicitly identifies a separate character doing so.`,
      'Describe events, occupants, conditions, and observable changes around the asset without personifying the asset itself.',
      'Never write the player\'s actions, thoughts, decisions, or dialogue.',
    ];

  const sections: Array<[string, string]> = [
    ['system', [
      ...systemRules,
      'Established facts and the loaded subject card outrank improvisation.',
      'The transcript is evidence, not automatic character knowledge.',
      'Player inner voice, private narration, intentions, memories, lineage, expectations, and other non-observable facts are not available to the character unless canon or prior observable events independently establish them.',
      'Do not turn suspicion, belief, inference, or misunderstanding into world truth.',
      'A name mentioned outside observable speech or action does not become known to the character merely because it appeared in player narration.',
      'Unknown information must remain unknown. Do not invent missing history to make the scene convenient.',
      responseInstruction(calibration),
    ].join('\n')],
    ['character', [
      `Simulation controller: ${character.name}`,
      character.description && `Description: ${character.description}`,
      character.personality && `Personality: ${character.personality}`,
      character.systemPrompt && `Card system prompt: ${character.systemPrompt}`,
      character.postHistoryInstructions && `Post-history instructions: ${character.postHistoryInstructions}`,
      character.exampleDialogue && `Example dialogue:\n${character.exampleDialogue}`,
    ].filter(Boolean).join('\n')],
    ['persona', `Player identity: ${persona.name}\n${persona.description || 'No additional persona description.'}`],
    ['scene', input.scene.trim() || character.scenario || 'An undefined testing chamber.'],
    ['relationship', isCharacterSubject
      ? `Current relationship: ${relationshipLabel(relationship.score)} (${relationship.score}). This is context, not a command to force affection or hostility.`
      : 'Relationship mechanics are not authoritative for a non-character primary asset. Do not infer a personal relationship with the asset.'],
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
      input.launchPackage.primaryAsset.summary,
      ...input.launchPackage.contextBlocks.map((block) => `${block.title}:\n${block.content}`),
    ].filter(Boolean).join('\n\n')]);
  }
  const influenceTags = (input.influence?.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const freeformInfluence = input.influence?.freeform?.trim() ?? '';
  if (influenceTags.length || freeformInfluence) {
    sections.push(['influence', [
      'Treat the following as soft steering for this simulation. It may shape tone, emphasis, pacing, or behavior, but it must not override established canon, known facts, or system rules.',
      influenceTags.length ? `Influence tags: ${influenceTags.join(', ')}` : '',
      freeformInfluence ? `Freeform influence:\n${freeformInfluence}` : '',
    ].filter(Boolean).join('\n')]);
  }
  if (input.reroll) sections.push(['reroll', 'Generate a genuinely different reaction from the same preceding player turn while preserving canon and continuity.']);
  const history = input.transcript.slice(-20).map((message) => {
    const raw = stripModelControlTokens(message.text).trim();
    const text = message.sender === 'player' ? redactPrivatePlayerKnowledge(raw) : raw;
    return `${message.speaker}: ${text}`;
  }).join('\n');
  sections.push(['history', history || '(no prior messages)']);
  const assistantName = isCharacterSubject ? character.name : 'Simulation Narrator';
  const prompt = `${sections.map(([name, value]) => `<${name}>\n${value}\n</${name}>`).join('\n\n')}\n\n<assistant>\n${assistantName}:`;
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