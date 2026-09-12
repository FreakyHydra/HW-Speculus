import type { BeatPlanV1, ResponseMode, TargetProtocol } from '../contracts';

const BEAT_LIMITS: Record<ResponseMode, number> = {
  concise: 1,
  normal: 2,
  long: 4,
  adaptive: 2,
};

export function createBeatPlan(
  targetProtocol: TargetProtocol,
  responseMode: ResponseMode,
  playerInput: string,
): BeatPlanV1 {
  return {
    schemaVersion: 'beat-plan/1',
    targetProtocol,
    responseMode,
    maximumBeats: BEAT_LIMITS[responseMode],
    immediateTrigger: playerInput.trim(),
    forbiddenAdvances: [
      'new spoken dialogue attributed to the player',
      'unrequested time skips or location transitions',
      'follow-on events after a natural player handoff',
      'new named people not present in packaged canon, the transcript, or the player turn',
      'narrator or GM questions asking the player what to do next',
      'engine, procedural, relationship-score, trust, fear, or state-update annotations inside the visible roleplay reply',
      'new ownership, custody, legal-status, or relationship-state claims not established by packaged canon, the transcript, or the player turn',
    ],
    playerHandoff: 'Stop when the immediate reaction or consequence gives the player a meaningful opportunity to respond. Yield control without asking the player what to do next.',
  };
}

export function renderBeatPlan(plan: BeatPlanV1): string {
  const scope = plan.maximumBeats === 1
    ? 'Render exactly one immediate meaningful reaction or consequence.'
    : `Render no more than ${plan.maximumBeats} tightly connected beats.`;
  return [
    `Target protocol: ${plan.targetProtocol}.`,
    `Response mode: ${plan.responseMode.toLocaleUpperCase('en-US')}.`,
    scope,
    'Continue from the exact stopping point. Do not recap or repeat the player input before reacting.',
    'Treat time, location, condition, and restraint changes explicitly authored in the player turn as the current state. Do not advance beyond that new stopping point.',
    'Characters may physically affect, restrain, move, or overpower the player. Never supply spoken dialogue for the player.',
    'Visible roleplay must contain only the rendered world. Do not print engine bookkeeping, procedural status, relationship scores, trust/fear changes, state-update notes, or diagnostic annotations.',
    'Do not invent ownership, custody, legal status, or relationship labels. Use those only when packaged canon, the prior transcript, or the current player turn already establishes them.',
    'At the player handoff, stop cleanly. Do not add narrator/GM prompts such as "What do you do?", "Where will you go?", or similar questions. A character may still ask an in-world question naturally in spoken dialogue.',
    `Forbidden advances: ${plan.forbiddenAdvances.join('; ')}.`,
    plan.playerHandoff,
  ].join('\n');
}
