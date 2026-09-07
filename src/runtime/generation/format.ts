const MARKED_SPAN = /(\*[^*]+\*|"[^"]+"|\[[^\]]+\])/;

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

export function normalizeRoleplayReply(raw: string, latestPlayerTurn = ''): string {
  let value = stripEchoedPlayerTurn(raw.trim(), latestPlayerTurn)
    .replace(/<\|(?:assistant|user|system)\|>/gi, '')
    .replace(/^\s*(?:assistant|character)\s*:\s*/i, '')
    .replace(/[“”]/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!value) throw new Error('The provider returned an empty reply.');
  if (!MARKED_SPAN.test(value)) value = `"${value.replace(/^"|"$/g, '')}"`;
  return value;
}

export function isRoleplayFormattingStable(value: string): boolean {
  if (!value.trim()) return false;
  const without = value.replace(/\*[^*]+\*/g, '').replace(/"[^"]+"/g, '').replace(/\[[^\]]+\]/g, '').trim();
  return without.length === 0;
}
