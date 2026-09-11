import type { SafeProviderMetadata } from '../../schema/types';
import type { BeatPlanV1, DraftValidationIssue, DraftValidationResult } from '../contracts';

const PLAYER_ACTION_VERBS = [
  'walk', 'walks', 'step', 'steps', 'move', 'moves', 'turn', 'turns', 'nod', 'nods',
  'shake', 'shakes', 'reach', 'reaches', 'take', 'takes', 'give', 'gives', 'open', 'opens',
  'close', 'closes', 'enter', 'enters', 'leave', 'leaves', 'follow', 'follows', 'sit', 'sits',
  'stand', 'stands', 'look', 'looks', 'say', 'says', 'ask', 'asks', 'answer', 'answers',
  'think', 'thinks', 'decide', 'decides', 'feel', 'feels', 'realize', 'realizes',
  'remember', 'remembers',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function controlsNamedPlayer(reply: string, playerName: string): boolean {
  const subject = escapeRegExp(playerName.trim());
  const action = PLAYER_ACTION_VERBS.join('|');
  const actionSpans = [...reply.matchAll(/\*([^*]+)\*/g)].map((match) => match[1]);
  const controlsAction = actionSpans.some((span) =>
    new RegExp(`^\\s*(?:${subject}|you)\\s+(?:${action})\\b`, 'iu').test(span),
  );
  const writesPlayerDialogue = playerName.trim()
    ? new RegExp(`(?:^|\\n)\\s*${subject}\\s*:`, 'imu').test(reply)
    : false;
  return controlsAction || writesPlayerDialogue;
}

export function validateDraft(input: {
  reply: string;
  playerName: string;
  provider: SafeProviderMetadata;
  beatPlan: BeatPlanV1;
}): DraftValidationResult {
  const issues: DraftValidationIssue[] = [];
  if (input.provider.completionStatus && input.provider.completionStatus !== 'completed' && input.provider.completionStatus !== 'unknown') {
    issues.push({ code: 'provider_incomplete', message: `Provider completion status is ${input.provider.completionStatus}.` });
  }
  if (controlsNamedPlayer(input.reply, input.playerName)) {
    issues.push({ code: 'player_control', message: `The draft assigns an action to ${input.playerName}.` });
  }
  return { accepted: issues.length === 0, issues };
}

export function assertDraftAccepted(result: DraftValidationResult): void {
  if (result.accepted) return;
  const message = result.issues.map((issue) => issue.message).join(' ');
  throw new Error(`GENERATION REJECTED: ${message}`);
}
