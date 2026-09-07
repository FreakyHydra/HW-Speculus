import {
  RELATIONSHIP_DIMENSIONS,
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
  RELATIONSHIP_NEUTRAL,
  relationshipKey,
  type RelationshipDimensions,
  type RelationshipEvent,
  type RelationshipRecord,
  type RelationshipState,
} from './schema';

const TIERS = [
  [-1000, 'SEETHING'], [-750, 'HOSTILE'], [-300, 'ANTAGONISTIC'], [-100, 'SUSPICIOUS'],
  [-10, 'WARY'], [0, 'STRANGER'], [50, 'ACQUAINTANCE'], [200, 'COMFORTABLE'],
  [800, 'TRUSTED'], [2000, 'CLOSE'], [4500, 'AFFECTIONATE'], [7500, 'DEEPLY BONDED'],
  [9500, 'DEVOTED'],
] as const;

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return RELATIONSHIP_NEUTRAL;
  return Math.max(RELATIONSHIP_MIN, Math.min(RELATIONSHIP_MAX, Math.round(value)));
}

export function relationshipLabel(value: number): string {
  const score = clampScore(value);
  let label: string = TIERS[0][1];
  for (const [minimum, candidate] of TIERS) if (score >= minimum) label = candidate;
  return label;
}

export function emptyDimensions(): RelationshipDimensions {
  return Object.fromEntries(RELATIONSHIP_DIMENSIONS.map((key) => [key, 0])) as RelationshipDimensions;
}

function dimensionsFrom(events: RelationshipEvent[]): RelationshipDimensions {
  const result = emptyDimensions();
  for (const event of events) {
    for (const [key, value] of Object.entries(event.dimensionDeltas)) {
      if (!(key in result) || typeof value !== 'number') continue;
      const dimension = key as keyof RelationshipDimensions;
      result[dimension] = Math.max(-100, Math.min(100, result[dimension] + value));
    }
  }
  return result;
}

export function makeRelationshipRecord(characterId: string, personaId: string): RelationshipRecord {
  return {
    characterId,
    personaId,
    baselineScore: 0,
    score: 0,
    label: 'STRANGER',
    dimensions: emptyDimensions(),
    events: [],
    updatedAt: Date.now(),
  };
}

function rebuilt(record: RelationshipRecord, events: RelationshipEvent[]): RelationshipRecord {
  const score = clampScore(record.baselineScore + events.reduce((sum, event) => sum + event.delta, 0));
  return { ...record, score, label: relationshipLabel(score), dimensions: dimensionsFrom(events), events, updatedAt: Date.now() };
}

export function getRelationship(
  state: RelationshipState,
  characterId: string,
  personaId: string,
): RelationshipRecord {
  return state[relationshipKey(characterId, personaId)] ?? makeRelationshipRecord(characterId, personaId);
}

export function commitRelationshipEvent(
  state: RelationshipState,
  event: Omit<RelationshipEvent, 'id'>,
): RelationshipState {
  const key = relationshipKey(event.characterId, event.personaId);
  const record = getRelationship(state, event.characterId, event.personaId);
  const replacement: RelationshipEvent = { ...event, id: `rel:${event.turnId}` };
  const events = [...record.events.filter((current) => current.turnId !== event.turnId), replacement]
    .sort((left, right) => left.createdAt - right.createdAt);
  return { ...state, [key]: rebuilt(record, events) };
}

export function removeRelationshipTurns(
  state: RelationshipState,
  characterId: string,
  personaId: string,
  turnIds: string[],
): RelationshipState {
  const key = relationshipKey(characterId, personaId);
  const record = state[key];
  if (!record) return state;
  const removed = new Set(turnIds);
  return { ...state, [key]: rebuilt(record, record.events.filter((event) => !removed.has(event.turnId))) };
}
