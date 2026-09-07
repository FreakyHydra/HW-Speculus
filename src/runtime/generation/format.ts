const MARKED_SPAN = /(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  let value = reply;

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
  let value = stripEchoedPlayerTurn(raw.trim(), latestPlayerTurn)
    .replace(/<\|(?:assistant|user|system)\|>/gi, '')
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
