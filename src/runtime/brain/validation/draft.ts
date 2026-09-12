import type { SafeProviderMetadata } from '../../schema/types';
import type { BeatPlanV1, DraftValidationIssue, DraftValidationResult, TurnAuthorityV1 } from '../contracts';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function usesPlayerVoice(reply: string, playerName: string): boolean {
  const subject = escapeRegExp(playerName.trim());
  const actionSpans = [...reply.matchAll(/\*([^*]+)\*/g)].map((match) => match[1]);
  const writesPlayerDialogue = playerName.trim()
    ? new RegExp(`(?:^|\\n)\\s*${subject}\\s*:`, 'imu').test(reply)
    : false;
  const voiceVerbs = 'say|says|said|ask|asks|asked|answer|answers|answered|reply|replies|replied|shout|shouts|shouted|whisper|whispers|whispered';
  const takesPlayerVoiceInAction = actionSpans.some((span) =>
    new RegExp(`\\b(?:${subject}|you)\\s+(?:managed\\s+to\\s+)?(?:${voiceVerbs}|gasp|gasps|gasped)\\b`, 'iu').test(span),
  );
  const attributesQuotedSpeechToPlayer = new RegExp(
    `["”]\\s*,?\\s*(?:${subject}|you)\\s+(?:managed\\s+to\\s+)?(?:${voiceVerbs}|gasp|gasps|gasped)\\b`,
    'iu',
  ).test(reply);
  return writesPlayerDialogue || takesPlayerVoiceInAction || attributesQuotedSpeechToPlayer;
}

function inventsPrivatePlayerState(reply: string, playerName: string): boolean {
  const subject = escapeRegExp(playerName.trim());
  return [...reply.matchAll(/\*([^*]+)\*/g)].some((match) => new RegExp(
    `^\\s*(?:${subject}|you)\\s+(?:feel|feels|felt|think|thinks|thought|realize|realizes|realized|remember|remembers|remembered|decide|decides|decided|wonder|wonders|wondered)\\b`,
    'iu',
  ).test(match[1]));
}

function inventsPlayerAction(reply: string, playerName: string): boolean {
  const subject = escapeRegExp(playerName.trim());
  const voluntaryActions = [
    'agree', 'answer', 'ask', 'choose', 'close', 'decide', 'enter', 'follow', 'give', 'grab',
    'leave', 'look', 'move', 'nod', 'open', 'reach', 'reply', 'say', 'shake', 'sit', 'stand',
    'step', 'take', 'turn', 'walk',
  ].join('|');
  return [...reply.matchAll(/\*([^*]+)\*/g)].some((match) => new RegExp(
    `^\\s*(?:${subject}|you)\\s+(?:(?:quietly|slowly|quickly|carefully|hesitantly|reluctantly)\\s+)?(?:${voluntaryActions})(?:s|ed)?\\b`,
    'iu',
  ).test(match[1]));
}

function emitsEngineStatus(reply: string): boolean {
  const withoutDialogue = reply.replace(/"[^"]*"/g, '');
  return /<[^>\r\n]{1,400}>/u.test(withoutDialogue)
    || /(?:^|\n)\s*(?:procedural\s+)?(?:status|state|relationship|trust|fear)\s*:/imu.test(withoutDialogue)
    || /\b(?:procedural|engine)\s+(?:status|state)\b/iu.test(withoutDialogue);
}

function asksGenericPlayerHandoffQuestion(reply: string): boolean {
  const withoutDialogue = reply.replace(/"[^"]*"/g, '').trim();
  if (/\([^()\r\n]*\?\)\s*$/u.test(withoutDialogue)) return true;
  return /(?:^|\n)\s*\*?\s*(?:what\s+do\s+you\s+do(?:\s+now)?|what\s+will\s+you\s+do(?:\s+now)?|what\s+now|what\s+happens\s+next|where\s+(?:will|do)\s+you\b[^?]*|how\s+(?:will|do)\s+you\s+(?:respond|react)\b[^?]*)\?\s*\*?\s*$/imu.test(withoutDialogue);
}

export function validateDraft(input: {
  reply: string;
  authority: TurnAuthorityV1;
  provider: SafeProviderMetadata;
  beatPlan: BeatPlanV1;
}): DraftValidationResult {
  const issues: DraftValidationIssue[] = [];
  if (usesPlayerVoice(input.reply, input.authority.playerName)) {
    issues.push({ code: 'player_control', ruleId: 'PLAYER-VOICE-001', message: `The draft speaks for ${input.authority.playerName}.` });
  }
  if (inventsPlayerAction(input.reply, input.authority.playerName)) {
    issues.push({ code: 'player_control', ruleId: 'PLAYER-ACTION-001', message: `The draft invents a voluntary action for ${input.authority.playerName}.` });
  }
  if (inventsPrivatePlayerState(input.reply, input.authority.playerName)) {
    issues.push({ code: 'player_control', ruleId: 'PLAYER-STATE-001', message: `The draft invents a private state for ${input.authority.playerName}.` });
  }
  if (asksGenericPlayerHandoffQuestion(input.reply)) {
    issues.push({ code: 'turn_scope', ruleId: 'HANDOFF-001', message: 'The draft adds a narrator/GM question instead of yielding control cleanly.' });
  }
  if (emitsEngineStatus(input.reply)) {
    issues.push({ code: 'world_truth', ruleId: 'RENDER-STATE-001', message: 'The draft exposes engine or procedural state inside the visible roleplay reply.' });
  }
  return { accepted: issues.length === 0, issues };
}

export function assertDraftAccepted(result: DraftValidationResult): void {
  if (result.accepted) return;
  const message = result.issues.map((issue) => issue.message).join(' ');
  throw new Error(`GENERATION REJECTED: ${message}`);
}
