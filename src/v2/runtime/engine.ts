import type { ProviderAdapter } from '../../runtime/providers/types';
import { compileV2Context } from './context';
import { settingsSchema, type V2Diagnostics, type V2Session, type V2Turn } from './session';

export type EnginePhase = 'context' | 'generate' | 'validate' | 'commit';
export class V2DraftRejected extends Error {
  constructor(message: string, readonly diagnostics: V2Diagnostics) { super(message); }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// These are structural checks, not a claim of complete semantic understanding.
export function validateV2Reply(text: string, playerName = '') {
  const issues: string[] = [];
  if (!text.trim()) issues.push('The model returned an empty reply.');
  if (text.length > 64000) issues.push('The reply exceeds the safe transport size.');
  if (/<\|(?:user|assistant|system|im_start|im_end)\|>|<\/?(?:world_state|state_patch|analysis)>/i.test(text)) {
    issues.push('The draft exposes control tokens or a state patch.');
  }
  if (/^\s*(?:PLAYER|USER|SYSTEM|ENGINE STATE|VALIDATION RESULTS)\s*:/im.test(text)) {
    issues.push('The draft contains an unauthorized player or engine section.');
  }
  if (playerName.trim() && new RegExp(`^\\s*${escapeRegExp(playerName.trim())}\\s*:`, 'im').test(text)) {
    issues.push('The draft writes a speaker turn for the player persona.');
  }
  return issues;
}

export async function generateV2Turn(session: V2Session, provider: ProviderAdapter, options: {
  reroll?: boolean; signal?: AbortSignal; onPhase?: (phase: EnginePhase) => void; now?: number;
} = {}): Promise<V2Session> {
  const settings = settingsSchema.parse(session.settings);
  if (options.signal?.aborted) throw new Error('Generation cancelled. No provider call was made.');
  if (session.launch.expiresAt <= Date.now()) throw new Error('V2 authorization expired. Relaunch from Orbis, then import your V2 export.');
  const last = session.turns.at(-1);
  if (options.reroll && (!last || last.worldRevision !== session.world.revision)) {
    throw new Error('Reroll requires the latest turn and its unchanged world state.');
  }
  const player = (options.reroll ? last!.player : session.draft).trim();
  if (!player || player.length > 16000) throw new Error('Write a player turn between 1 and 16000 characters.');
  const base = options.reroll ? { ...session, turns: session.turns.slice(0, -1) } : session;
  options.onPhase?.('context');
  const compiled = compileV2Context(base, player);
  options.onPhase?.('generate');
  const result = await provider.generate({
    prompt: compiled.prompt, model: session.launch.model,
    temperature: settings.temperature, maxTokens: settings.maxTokens, topK: settings.topK, topP: settings.topP,
    presencePenalty: settings.presencePenalty, frequencyPenalty: settings.frequencyPenalty,
    // V2 is a renderer packet, not the legacy speaker-tag chat format. Hidden
    // player/persona stop strings can match at token zero and turn a formatting
    // mistake into an empty HTTP-200 completion. Only authored/user settings are
    // forwarded here; the Orbis bridge still applies provider-control stops.
    stopSequences: [...settings.stopSequences],
    continueToEndOfSentence: settings.continueToEndOfSentence, reroll: options.reroll, signal: options.signal,
  });
  if (options.signal?.aborted) throw new Error('Generation cancelled. No turn or state was committed.');
  options.onPhase?.('validate');
  const issues = validateV2Reply(result.text, session.launch.persona.name);
  const warnings = ['Semantic canon validation and automatic action resolution are not implemented yet. Prose cannot commit physical state.'];
  if (result.metadata.completionStatus === 'max_tokens') warnings.push('The provider reached the output limit. The reply is preserved without local truncation. Increase the budget and reroll if needed.');
  if (compiled.omitted.length) warnings.push('Some history/canon was omitted. Inspect the Context tab for the exact list.');
  const diagnostics: V2Diagnostics = {
    prompt: compiled.prompt, included: compiled.included, omitted: compiled.omitted,
    estimatedInputTokens: compiled.estimatedInputTokens, outputBudget: compiled.outputBudget,
    issues, warnings, model: session.launch.model, durationMs: result.metadata.durationMs,
    completionStatus: result.metadata.completionStatus ?? 'unknown', worldRevision: session.world.revision,
    providerKind: result.metadata.provider, providerEndpoint: result.metadata.endpoint, requestId: result.metadata.requestId,
    finishReason: result.metadata.finishReason, requestedMaxTokens: result.metadata.requestedMaxTokens,
    providerInputTokensEstimate: result.metadata.inputTokensEstimate,
  };
  if (issues.length) throw new V2DraftRejected(`Draft rejected: ${issues.join(' ')}`, diagnostics);
  const at = options.now ?? Date.now();
  const id = options.reroll ? last!.id : `v2:${session.id}:${session.nextTurn}`;
  const turn: V2Turn = { id, player, reply: result.text.trim(), createdAt: options.reroll ? last!.createdAt : at, worldRevision: session.world.revision, diagnostics };
  options.onPhase?.('commit');
  return {
    ...session, draft: options.reroll ? session.draft : '', turns: [...base.turns, turn],
    nextTurn: session.nextTurn + (options.reroll ? 0 : 1),
    events: options.reroll
      ? session.events.map((event) => event.id === id ? { ...event, label: 'Reply rerolled', at } : event)
      : [...session.events, { id, kind: 'turn', label: 'Reply committed', worldRevision: session.world.revision, at }],
  };
}
