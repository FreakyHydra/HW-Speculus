// Public Orbis error contract. Reconstruct messages from known codes instead of
// forwarding upstream bodies that could echo credentials or private scene text.
const errors = {
  NOVELAI_AUTH_FAILED: 'NovelAI rejected the saved access token. Update it in Orbis Account settings.',
  NOVELAI_ACCESS_DENIED: 'NovelAI did not authorize this generation. Check your subscription and model access.',
  NOVELAI_MODEL_UNAVAILABLE: 'The selected NovelAI model is unavailable.',
  NOVELAI_RATE_LIMITED: 'NovelAI is receiving too many requests. Wait and try again.',
  NOVELAI_INVALID_REQUEST: 'NovelAI rejected the generation settings or context.',
  NOVELAI_UNAVAILABLE: 'NovelAI is temporarily unavailable.',
  NOVELAI_REJECTED: 'NovelAI rejected this generation request.',
  NOVELAI_EMPTY_REPLY: 'NovelAI returned an empty roleplay reply.',
  NOVELAI_INVALID_RESPONSE: 'NovelAI returned an unreadable response.',
  NOVELAI_TIMEOUT: 'NovelAI did not finish within 180 seconds. No reply was committed.',
  NOVELAI_NETWORK_FAILURE: 'Orbis could not reach NovelAI. Check the Orbis server connection.',
} as const;
const legacyErrors = new Set([
  ...Object.values(errors),
  'NovelAI rejected the saved access token. Update it in Orbis settings.',
  'NovelAI did not authorize this generation.',
  'NovelAI could not generate this reply.',
  'A valid Speculus generation grant is required.',
  'The Speculus generation grant is missing, expired, or revoked.',
  'The generation request does not match its authorized launch package.',
  'Orbis could not complete that request.',
]);
const parameters = new Set(['model', 'prompt', 'max_tokens', 'temperature', 'top_k', 'top_p', 'frequency_penalty', 'presence_penalty', 'stop', 'seed', 'stream']);

export function bridgeErrorMessage(status: number, value: unknown, headerRequestId: string | null): string {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const knownCode = typeof body.code === 'string' && Object.hasOwn(errors, body.code) ? body.code as keyof typeof errors : undefined;
  let message = knownCode ? errors[knownCode] : typeof body.error === 'string' && legacyErrors.has(body.error) ? body.error : '';
  if (!message) message = `Orbis generation bridge returned HTTP ${status} without a recognized error. Check the Orbis API logs.`;
  if (knownCode && typeof body.upstreamStatus === 'number' && Number.isInteger(body.upstreamStatus) && body.upstreamStatus >= 100 && body.upstreamStatus <= 599) {
    message += ` NovelAI HTTP ${body.upstreamStatus}.`;
  }
  if (knownCode === 'NOVELAI_INVALID_REQUEST' && typeof body.parameter === 'string' && parameters.has(body.parameter)) {
    message += ` Rejected parameter: ${body.parameter}.`;
  }
  if (knownCode === 'NOVELAI_EMPTY_REPLY' && typeof body.finishReason === 'string' && ['stop', 'length', 'max_tokens', 'eos', 'content_filter', 'error'].includes(body.finishReason)) {
    message += ` Finish reason: ${body.finishReason}.`;
  }
  if ((knownCode === 'NOVELAI_INVALID_REQUEST' || knownCode === 'NOVELAI_EMPTY_REPLY')
    && typeof body.requestedMaxTokens === 'number' && Number.isInteger(body.requestedMaxTokens) && body.requestedMaxTokens >= 32 && body.requestedMaxTokens <= 4096) {
    message += ` Requested output: ${body.requestedMaxTokens} tokens.`;
  }
  // New Orbis failure IDs are locally generated UUIDs, not arbitrary provider
  // headers. Older Orbis versions still get their known static message above.
  const requestId = body.requestId ?? headerRequestId;
  if (typeof requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    message += ` Request: ${requestId}.`;
  }
  return message;
}
