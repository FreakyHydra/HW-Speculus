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

function cleanGeneratedTurn(value: string, personaName: string): string {
  let text = value
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const escaped = personaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escaped) {
    text = text.replace(new RegExp(`^(?:PLAYER|USER|${escaped})\\s*:\\s*`, 'i'), '').trim();
  } else {
    text = text.replace(/^(?:PLAYER|USER)\s*:\s*/i, '').trim();
  }
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
    'You are writing ONLY the next PLAYER turn in an ongoing roleplay.',
    `Write as ${personaName}, the loaded player persona.`,
    `Do not write actions, dialogue, thoughts, decisions, or narration for ${characterName} or any other non-player controlled character.`,
    'Do not continue into the other character\'s response. Stop at the end of the player turn.',
    'Stay consistent with the player persona, current scene, recent transcript, established facts, relationships, and what the player reasonably knows.',
    'Make a natural next move. Prefer a concise turn rather than a long monologue unless the situation clearly calls for more.',
    'Use roleplay formatting: actions/narration in single asterisks, spoken dialogue in straight double quotes, and thoughts in square brackets when useful.',
    'Return ONLY the player turn. Do not prefix it with PLAYER, USER, a name, or commentary.',
    draft
      ? 'The composer already contains a rough player draft. Treat it as intent/direction and turn it into the completed player turn without changing the intended action.'
      : 'The composer is empty. Choose the most natural player reaction or action from context.',
    '',
    'PLAYER PERSONA:',
    compactJson(session.persona, 10000),
    '',
    'CURRENT SCENE:',
    session.scene?.trim() || 'Not specified.',
    '',
    'ROLEPLAY SUBJECT:',
    compactJson(session.character, 10000),
    '',
    'RECENT TRANSCRIPT:',
    transcriptContext(session.transcript),
    ...(draft ? ['', 'ROUGH PLAYER DRAFT:', draft] : []),
    '',
    `NEXT TURN — ${personaName}:`,
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
        maxTokens: Math.min(Math.max(provider.maxTokens ?? 350, 128), 600),
        reroll: false,
      }),
    });
    const body = await response.json() as { text?: string; error?: string };
    if (!response.ok || !body.text) throw new Error(body.error || `HTTP ${response.status}`);

    const generated = cleanGeneratedTurn(body.text, personaName);
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
  button.title = 'Let the model write the next player turn into the composer. It will not transmit automatically.';
  button.setAttribute('aria-label', 'Write the next player turn');
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
