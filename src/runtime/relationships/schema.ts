export const RELATIONSHIP_MIN = -1000;
export const RELATIONSHIP_MAX = 10000;
export const RELATIONSHIP_NEUTRAL = 0;

export const RELATIONSHIP_DIMENSIONS = [
  'trust', 'affection', 'respect', 'fear', 'comfort', 'suspicion',
  'attachment', 'protectiveness', 'resentment', 'loyalty', 'familiarity', 'authority',
] as const;

export type RelationshipDimension = (typeof RELATIONSHIP_DIMENSIONS)[number];
export type RelationshipDimensions = Record<RelationshipDimension, number>;

export type RelationshipEvent = {
  id: string;
  characterId: string;
  personaId: string;
  turnId: string;
  delta: number;
  reason: string;
  dimensionDeltas: Partial<RelationshipDimensions>;
  createdAt: number;
};

export type RelationshipRecord = {
  characterId: string;
  personaId: string;
  baselineScore: number;
  score: number;
  label: string;
  dimensions: RelationshipDimensions;
  events: RelationshipEvent[];
  updatedAt: number;
};

export type RelationshipState = Record<string, RelationshipRecord>;

export function relationshipKey(characterId: string, personaId: string): string {
  return `${characterId}::${personaId}`;
}
