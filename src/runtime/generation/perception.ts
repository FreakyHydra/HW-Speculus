import type { ActiveCastResult, CharacterCard, PerceptionResult, Persona } from '../schema/types';

const COMMON_CAPITALIZED = new Set(['I', 'The', 'A', 'An', 'This', 'That', 'He', 'She', 'They', 'We', 'You']);

export function resolveActiveCast(character: CharacterCard, input: string): ActiveCastResult {
  const mentioned = [...input.matchAll(/\b[A-Z][a-z]{1,30}\b/g)]
    .map((match) => match[0])
    .filter((name, index, values) => !COMMON_CAPITALIZED.has(name) && name !== character.name && values.indexOf(name) === index);
  return {
    primaryId: character.id,
    primaryName: character.name,
    active: [{ id: character.id, name: character.name, reason: 'loaded primary subject' }],
    mentionedOnly: mentioned,
  };
}

export function resolvePerception(
  character: CharacterCard,
  persona: Persona,
  scene: string,
  input: string,
): PerceptionResult {
  const cast = resolveActiveCast(character, input);
  return {
    input,
    sceneFacts: [scene.trim() || 'No scene description was supplied.'],
    visibleSubjects: [character.name],
    mentionedNames: cast.mentionedOnly,
    filtered: cast.mentionedOnly.map((value) => ({ value, reason: 'Mentioned name is not a loaded subject and was not activated.' })),
  };
}
