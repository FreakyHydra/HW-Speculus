import type { RelationshipDimensions } from './schema';

export type RelationshipEvaluation = {
  delta: number;
  reason: string;
  dimensionDeltas: Partial<RelationshipDimensions>;
};

export type RelationshipScorer = {
  evaluate(input: { playerMessage: string; characterReply: string; previousScore: number }): RelationshipEvaluation;
};

const cues: Array<{ pattern: RegExp; delta: number; reason: string; dimensions: Partial<RelationshipDimensions> }> = [
  { pattern: /\b(?:i trust you|you can trust me)\b/i, delta: 6, reason: 'Trust was expressed.', dimensions: { trust: 4 } },
  { pattern: /\b(?:thank you|thanks|i care about you|i care for you)\b/i, delta: 4, reason: 'Care or gratitude was expressed.', dimensions: { affection: 2, comfort: 2 } },
  { pattern: /\b(?:i(?:'m| am) sorry|forgive me|i apologize|i apologise)\b/i, delta: 5, reason: 'An apology or forgiveness attempt was made.', dimensions: { trust: 2, respect: 2 } },
  { pattern: /\b(?:hate you|kill you|hurt you|shut up)\b/i, delta: -12, reason: 'A hostile cue was detected.', dimensions: { fear: 3, resentment: 5, trust: -5 } },
  { pattern: /\b(?:leave me alone|do not touch me|don't touch me|stop)\b/i, delta: -2, reason: 'A boundary was asserted.', dimensions: { respect: 1, comfort: -2 } },
];

export const heuristicRelationshipScorer: RelationshipScorer = {
  evaluate({ playerMessage }) {
    const hits = cues.filter((cue) => cue.pattern.test(playerMessage));
    if (hits.length === 0) return { delta: 0, reason: 'No explicit relationship-changing cue.', dimensionDeltas: {} };
    const dimensions: Partial<RelationshipDimensions> = {};
    for (const hit of hits) {
      for (const [key, value] of Object.entries(hit.dimensions)) {
        const dimension = key as keyof RelationshipDimensions;
        dimensions[dimension] = (dimensions[dimension] ?? 0) + Number(value);
      }
    }
    return {
      delta: Math.max(-20, Math.min(12, hits.reduce((sum, hit) => sum + hit.delta, 0))),
      reason: hits.map((hit) => hit.reason).join(' '),
      dimensionDeltas: dimensions,
    };
  },
};
