const SESSION_STORAGE_KEY = 'speculus.session.v1';

type StoredTranscriptMessage = {
  sender?: 'player' | 'character' | string;
  speaker?: string;
  text?: string;
};

type StoredSession = {
  persona?: { name?: string; [key: string]: unknown } | null;
  character?: { name?: string; [key: string]: unknown } | null;
  scene?: string;
  transcript?: StoredTranscriptMessage[];
  settings?: {
    provider?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
};

function readStoredSession(): StoredSession | null {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function setReactTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(value.length, value.length);
  });
}

function compactJson(value: unknown, maxChars: number): string {
  if (value == null) return 'Not available';
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return 'Not available';
  }
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function transcriptContext(messages: StoredTranscriptMessage[] | undefined): string {
  if (!messages?.length) return 'No prior transcript.';
  return messages
    .slice(-18)
    .map((message) => {
      const role = message.sender === 'player' ? 'PLAYER' : 'CHARACTER';
      const speaker = message.speaker ? ` ${message.speaker}` : '';
      return `${role}${speaker}: ${message.text ?? ''}`;
    })
    .join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanGeneratedTurn(value: string, personaName: string, characterName: string): string {
  let text = value
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // AUTO TURN asks the model to emit this sentinel after exactly one player turn.
  // Anything after it is never allowed into the composer.
  text = text.split(/<<END_PLAYER_TURN>>/i, 1)[0].trim();

  const escapedPersona = escapeRegExp(personaName);
  const escapedCharacter = escapeRegExp(characterName);
  const playerPrefix = escapedPersona
    ? new RegExp(`^(?:PLAYER|USER|${escapedPersona})\\s*[:—-]\\s*`, 'i')
    : /^(?:PLAYER|USER)\s*[:—-]\s*/i;
  text = text.replace(playerPrefix, '').trim();

  // Defensive cut-off: if the model begins a CHARACTER/ASSISTANT/NPC turn despite
  // the prompt, discard that turn and everything after it. This catches the common
  // failure where Auto Turn writes several alternating turns in one generation.
  const forbiddenSpeaker = escapedCharacter
    ? new RegExp(`^\\s*(?:CHARACTER|ASSISTANT|NPC|${escapedCharacter})\\s*[:—-]`, 'i')
    : /^\s*(?:CHARACTER|ASSISTANT|NPC)\s*[:—-]/i;
  const lines = text.split(/\r?\n/);
  const stopAt = lines.findIndex((line, index) => index > 0 && forbiddenSpeaker.test(line));
  if (stopAt >= 0) text = lines.slice(0, stopAt).join('\n').trim();

  return text;
}

async function generatePlayerTurn(textarea: HTMLTextAreaElement, button: HTMLButtonElement) {
  const session = readStoredSession();
  const provider = session?.settings?.provider;
  if (!session?.persona || !provider?.model) {
    button.textContent = 'AUTO TURN FAILED';
    window.setTimeout(() => { button.textContent = 'AUTO TURN'; }, 1600);
    return;
  }

  const personaName = session.persona.name || 'the player persona';
  const characterName = session.character?.name || 'the other character';
  const draft = textarea.value.trim();
  const previousLabel = button.textContent || 'AUTO TURN';
  button.disabled = true;
  button.textContent = 'WRITING TURN…';

  const prompt = [
    'Write EXACTLY ONE PLAYER TURN for an ongoing roleplay.',
    `You control ONLY ${personaName}, the loaded player persona.`,
    `You do NOT control ${characterName}, the roleplay subject, or any other NPC.`,
    'A turn means one continuous player contribution before the other character gets a chance to respond.',
    'Never invent, predict, quote, summarize, or write the other character\'s response.',
    'Never continue the scene past the point where another character would naturally respond.',
    'Never write a second player reaction to an imagined response. Do not simulate an exchange or conversation.',
    'Do not write multiple alternating turns inside one answer.',
    'Use only information the player persona reasonably knows and preserve established facts and continuity.',
    'Make one natural immediate move. It may contain action, dialogue, and thought, but all of it must belong to the SAME player turn.',
    'Prefer a concise turn unless the immediate action genuinely requires more detail.',
    'Use roleplay formatting: actions/narration in single asterisks, spoken dialogue in straight double quotes, and thoughts in square brackets when useful.',
    'Return only the player turn, followed immediately by the literal marker <<END_PLAYER_TURN>>.',
    'Do not prefix the turn with PLAYER, USER, a character name, or commentary.',
    draft
      ? 'The composer already contains a rough player draft. Treat it as intent/direction and complete ONLY that one player turn without changing the intended action.'
      : 'The composer is empty. Choose the most natural single player reaction or action from context.',
    '',
    'PLAYER PERSONA:',
    compactJson(session.persona, 10000),
    '',
    'CURRENT SCENE:',
    session.scene?.trim() || 'Not specified.',
    '',
    'ROLEPLAY SUBJECT (CONTEXT ONLY — DO NOT WRITE FOR THEM):',
    compactJson(session.character, 10000),
    '',
    'RECENT TRANSCRIPT (CONTEXT ONLY — DO NOT CONTINUE BOTH SIDES):',
    transcriptContext(session.transcript),
    ...(draft ? ['', 'ROUGH PLAYER DRAFT:', draft] : []),
    '',
    `ONE PLAYER TURN — ${personaName}:`,
  ].join('\n');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'orbis',
        prompt,
        model: provider.model,
        temperature: provider.temperature ?? 0.8,
        maxTokens: Math.min(Math.max(provider.maxTokens ?? 300, 128), 420),
        reroll: false,
      }),
    });
    const body = await response.json() as { text?: string; error?: string };
    if (!response.ok || !body.text) throw new Error(body.error || `HTTP ${response.status}`);

    const generated = cleanGeneratedTurn(body.text, personaName, characterName);
    if (!generated) throw new Error('Auto Turn returned empty text.');

    setReactTextareaValue(textarea, generated);
    button.textContent = 'TURN READY';
  } catch (error) {
    console.error('Speculus Auto Turn failed', error);
    button.textContent = 'AUTO TURN FAILED';
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = previousLabel;
    }, 1400);
  }
}

function installButton() {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Player turn"]');
  const form = textarea?.closest<HTMLFormElement>('form.composer');
  if (!textarea || !form || form.querySelector('[data-auto-turn]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'terminal-button composer-auto-turn-button';
  button.dataset.autoTurn = 'true';
  button.textContent = 'AUTO TURN';
  button.title = 'Let the model write exactly one next player turn into the composer. It will not transmit automatically.';
  button.setAttribute('aria-label', 'Write one next player turn');
  button.addEventListener('click', () => void generatePlayerTurn(textarea, button));

  const transmit = form.querySelector<HTMLButtonElement>('.send-button');
  if (transmit) form.insertBefore(button, transmit);
  else form.append(button);
}

export function installAutoTurn() {
  installButton();
  const observer = new MutationObserver(() => installButton());
  observer.observe(document.body, { childList: true, subtree: true });
}
