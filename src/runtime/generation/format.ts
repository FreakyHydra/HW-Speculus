const MARKED_SPAN = /(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/;
const MARKED_PLAYER_SPAN = /(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/g;

const INTERNAL_CONTEXT_LEAK_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(?:character|persona|scene|relationship|clock|format|history|reroll|registry|orbis-asset)\s*>/i,
  /^\s*(?:Card system prompt|Post-history instructions|Canonical Speculus identity|Internal global registry sequence|Internal [^:\r\n]+ sequence|Source revision|Packaged data)\s*:/im,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripModelControlTokens(value: string): string {
  return value
    .replace(/<\s*\/?\s*(?:assistant|user|system)\s*>/gi, '')
    .replace(/<\s*\|\s*(?:assistant|user|system)\s*\|\s*>/gi, '');
}

function redactPrivateAction(action: string): string {
  const inner = action.slice(1, -1).trim();
  const privateCue = /\b(?:thinking|wondering|remembering|knowing|hoping|expecting|realizing|imagining|believing|suspecting|planning|intending)\b/i.exec(inner);
  const observable = privateCue ? inner.slice(0, privateCue.index).replace(/[\s,;:-]+$/, '').trim() : inner;
  return observable ? `*${observable}*` : '';
}

/**
 * Produce the player text that may be shown to the active roleplay subject.
 * Raw transcript text remains untouched elsewhere for evidence/export.
 *
 * When the player uses Speculus roleplay markup, only spoken dialogue and
 * outward action spans are forwarded. Square-bracketed inner voice and
 * unmarked narration around marked spans are treated as private. Plain,
 * completely unmarked input is preserved for backwards-compatible chat use.
 */
export function redactPrivatePlayerKnowledge(value: string): string {
  const cleaned = stripModelControlTokens(value).trim();
  const spans = [...cleaned.matchAll(MARKED_PLAYER_SPAN)].map((match) => match[0]);
  if (!spans.length) return cleaned;

  const visible = spans
    .filter((span) => !span.startsWith('['))
    .map((span) => span.startsWith('*') ? redactPrivateAction(span) : span)
    .filter(Boolean)
    .join(' ')
    .trim();

  return visible || '(private player narration omitted)';
}

export function containsInternalContextLeak(value: string): boolean {
  return INTERNAL_CONTEXT_LEAK_PATTERNS.some((pattern) => pattern.test(value));
}

export function stripEchoedPlayerTurn(reply: string, playerTurn: string): string {
  const words = (value: string) => [...value.toLocaleLowerCase('en-US').matchAll(/[\p{L}\p{N}]+/gu)].map((match) => match[0]);
  const source = words(playerTurn);
  const output = [...reply.matchAll(/[\p{L}\p{N}]+/gu)];
  if (source.length < 5 || source.join(' ').length < 24 || output.length < source.length) return reply;
  if (source.some((word, index) => word !== output[index][0].toLocaleLowerCase('en-US'))) return reply;
  const end = (output[source.length - 1].index ?? 0) + output[source.length - 1][0].length;
  const remainder = reply.slice(end).replace(/^[\s*"'\][).,!?:;-]+/, '').trim();
  return remainder || reply;
}

function cleanModelArtifacts(reply: string, characterName = '', playerName = ''): string {
  let value = stripModelControlTokens(reply);

  // Model-side metadata is useful for diagnostics but should never appear in the chat transcript.
  value = value.replace(/^\s*Emotion\s*:\s*[^\r\n]*(?:\r?\n|$)/gim, '');

  // The transcript already renders the active speaker. Preserve the prose after any repeated character label.
  if (characterName) {
    value = value.replace(new RegExp(`^\\s*${escapeRegExp(characterName)}\\s*:\\s*`, 'gim'), '');
  }

  // A real speaker boundary means the model has started writing someone other than the active subject.
  const boundaries: RegExp[] = [
    /^\s*(?:Assistant|System|User|Player)\s*:/im,
  ];
  if (playerName) boundaries.push(new RegExp(`^\\s*${escapeRegExp(playerName)}\\s*:\\s*`, 'im'));

  let cut = value.length;
  for (const boundary of boundaries) {
    const match = boundary.exec(value);
    if (match?.index !== undefined && match.index < cut) cut = match.index;
  }

  return value.slice(0, cut).replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeRoleplayReply(raw: string, latestPlayerTurn = '', characterName = '', playerName = ''): string {
  if (containsInternalContextLeak(raw)) {
    throw new Error('The provider reply exposed internal Speculus context and was blocked.');
  }

  let value = stripEchoedPlayerTurn(stripModelControlTokens(raw.trim()), latestPlayerTurn)
    .replace(/^\s*(?:assistant|character)\s*:\s*/i, '')
    .replace(/[“”]/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  value = cleanModelArtifacts(value, characterName, playerName);
  if (!value) throw new Error('The provider returned an empty reply.');
  if (!MARKED_SPAN.test(value)) value = `"${value.replace(/^"|"$/g, '')}"`;
  return value;
}

export function isRoleplayFormattingStable(value: string): boolean {
  if (!value.trim()) return false;
  const without = value.replace(/\*[^*]+\*/g, '').replace(/"[^"]+"/g, '').replace(/\[[^\]]+\]/g, '').trim();
  return without.length === 0;
}
