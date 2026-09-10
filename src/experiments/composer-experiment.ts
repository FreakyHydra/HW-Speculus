const SMART_PAIRS_KEY = 'speculus-smart-pairs';
const CLICKY_FORMAT_KEY = 'speculus-clicky-format-keys';
const SESSION_STORAGE_KEY = 'speculus.session.v1';
const DRAFT_KEY_PREFIX = 'speculus.draft.';
const CHECKPOINT_KEY_PREFIX = 'speculus.checkpoint.';

const PAIRS: Record<string, string> = {
  '*': '*',
  '"': '"',
  '[': ']',
};

const FORMAT_ACTIONS = [
  { label: '* ACTION', open: '*', close: '*', title: 'Wrap as action / narration' },
  { label: '" DIALOGUE', open: '"', close: '"', title: 'Wrap as spoken dialogue' },
  { label: '[ THOUGHT', open: '[', close: ']', title: 'Wrap as inner voice / thought' },
] as const;

type StoredSession = {
  id?: string;
  launchPackage?: { launchId?: string } | null;
  diagnostics?: Array<{ compiledContext?: { manifest?: { estimatedInputTokens?: number } } }>;
  settings?: { provider?: { model?: string; maxTokens?: number } };
};

function loadToggle(key: string): boolean {
  return window.localStorage.getItem(key) !== 'false';
}

function isPlayerComposer(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.getAttribute('aria-label') === 'Player turn';
}

function readStoredSession(): StoredSession | null {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredSession; } catch { return null; }
}

function sessionIdentity(): string {
  const session = readStoredSession();
  return session?.launchPackage?.launchId || session?.id || 'unbound';
}

function draftKey(): string {
  return `${DRAFT_KEY_PREFIX}${sessionIdentity()}`;
}

function checkpointKey(): string {
  return `${CHECKPOINT_KEY_PREFIX}${sessionIdentity()}`;
}

function setReactTextareaValue(textarea: HTMLTextAreaElement, value: string, selectionStart: number, selectionEnd = selectionStart) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
}

function wrapSelection(textarea: HTMLTextAreaElement, open: string, close: string) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end);
  const next = `${textarea.value.slice(0, start)}${open}${selected}${close}${textarea.value.slice(end)}`;
  if (selected) setReactTextareaValue(textarea, next, start + 1, end + 1);
  else setReactTextareaValue(textarea, next, start + 1);
}

function enclosingPairAtCaret(textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end || start <= 0 || start >= textarea.value.length) return null;
  const before = textarea.value[start - 1];
  const after = textarea.value[start];
  if ((before === '*' && after === '*') || (before === '"' && after === '"') || (before === '[' && after === ']')) {
    return { start: start - 1, end: start + 1, open: before, close: after };
  }
  return null;
}

function clickFormatAction(textarea: HTMLTextAreaElement, open: string, close: string) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end) {
    wrapSelection(textarea, open, close);
    return;
  }

  const emptyPair = enclosingPairAtCaret(textarea);
  if (emptyPair) {
    if (emptyPair.open === open && emptyPair.close === close) {
      textarea.focus();
      textarea.setSelectionRange(emptyPair.end, emptyPair.end);
      return;
    }
    const before = textarea.value.slice(0, emptyPair.end);
    const after = textarea.value.slice(emptyPair.end);
    const spacer = /^\s/.test(after) ? '' : ' ';
    const next = `${before}${spacer}${open}${close}${after}`;
    const pairStart = emptyPair.end + spacer.length;
    setReactTextareaValue(textarea, next, pairStart + 1);
    return;
  }

  const nextChar = textarea.value[start] ?? '';
  const previousChar = textarea.value[start - 1] ?? '';
  if (nextChar === close) {
    textarea.focus();
    textarea.setSelectionRange(start + 1, start + 1);
    return;
  }

  const completedCloser = previousChar === '*' || previousChar === '"' || previousChar === ']';
  if (completedCloser) {
    const after = textarea.value.slice(start);
    const spacer = /^\s/.test(after) ? '' : ' ';
    const next = `${textarea.value.slice(0, start)}${spacer}${open}${close}${after}`;
    setReactTextareaValue(textarea, next, start + spacer.length + 1);
    return;
  }

  wrapSelection(textarea, open, close);
}

function smartPairKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement) {
  if (!loadToggle(SMART_PAIRS_KEY) || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return false;

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const nextChar = textarea.value[start] ?? '';

  if (event.key === 'Backspace' && start === end && start > 0) {
    const before = textarea.value[start - 1];
    const after = textarea.value[start];
    if ((before === '*' && after === '*') || (before === '"' && after === '"') || (before === '[' && after === ']')) {
      event.preventDefault();
      setReactTextareaValue(textarea, textarea.value.slice(0, start - 1) + textarea.value.slice(start + 1), start - 1);
      return true;
    }
  }

  if (event.key === 'Tab' && start === end && (nextChar === '*' || nextChar === '"' || nextChar === ']')) {
    event.preventDefault();
    const afterCloser = textarea.value.slice(start + 1);
    const spacer = /^\s/.test(afterCloser) ? '' : ' ';
    const next = `${textarea.value.slice(0, start + 1)}${spacer}${afterCloser}`;
    setReactTextareaValue(textarea, next, start + 1 + spacer.length);
    return true;
  }

  if (start === end && ((event.key === '*' && nextChar === '*') || (event.key === '"' && nextChar === '"') || (event.key === ']' && nextChar === ']'))) {
    event.preventDefault();
    textarea.setSelectionRange(start + 1, start + 1);
    return true;
  }

  const close = PAIRS[event.key];
  if (!close) return false;
  event.preventDefault();
  wrapSelection(textarea, event.key, close);
  return true;
}

function sendOnEnter(event: KeyboardEvent, textarea: HTMLTextAreaElement) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return false;
  event.preventDefault();
  if (!textarea.value.trim()) return true;
  const form = textarea.closest('form');
  const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  if (submitButton?.disabled) return true;
  form?.requestSubmit();
  return true;
}

function installKeyboardBehavior() {
  document.addEventListener('keydown', (event) => {
    if (!isPlayerComposer(event.target)) return;
    if (sendOnEnter(event, event.target)) return;
    smartPairKeydown(event, event.target);
  }, true);

  document.addEventListener('paste', (event) => {
    if (!isPlayerComposer(event.target)) return;
    const text = event.clipboardData?.getData('text');
    if (!text || !/[“”]/.test(text)) return;
    event.preventDefault();
    const normalized = text.replace(/[“”]/g, '"');
    const textarea = event.target;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const next = `${textarea.value.slice(0, start)}${normalized}${textarea.value.slice(end)}`;
    setReactTextareaValue(textarea, next, start + normalized.length);
  }, true);
}

function makeToggle(labelText: string, key: string) {
  const label = document.createElement('label');
  label.className = 'toggle composer-experiment-toggle';
  label.dataset.composerExperiment = key;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = loadToggle(key);
  input.addEventListener('change', () => {
    window.localStorage.setItem(key, String(input.checked));
    syncHelperRow();
  });
  label.append(input, document.createTextNode(` ${labelText}`));
  return label;
}

function installControlToggles() {
  const group = document.querySelector<HTMLElement>('.control-group');
  if (!group || group.querySelector('[data-composer-experiment]')) return;
  const crtToggle = [...group.querySelectorAll<HTMLLabelElement>('label.toggle')]
    .find((label) => label.textContent?.includes('CRT MOTION'));
  const smart = makeToggle('SMART PAIRS', SMART_PAIRS_KEY);
  const clicky = makeToggle('CLICKY FORMAT KEYS', CLICKY_FORMAT_KEY);
  if (crtToggle) {
    crtToggle.insertAdjacentElement('afterend', clicky);
    crtToggle.insertAdjacentElement('afterend', smart);
  } else {
    group.append(smart, clicky);
  }
}

function latestContextTokens(): number | null {
  const diagnostics = readStoredSession()?.diagnostics;
  const value = diagnostics?.at(-1)?.compiledContext?.manifest?.estimatedInputTokens;
  return typeof value === 'number' ? value : null;
}

function syncContextMeter() {
  const meter = document.querySelector<HTMLElement>('.composer-context-meter');
  if (!meter) return;
  const tokens = latestContextTokens();
  meter.textContent = tokens == null ? 'CTX —' : `CTX ~${tokens.toLocaleString()} TOK`;
  meter.dataset.level = tokens == null ? 'none' : tokens >= 12000 ? 'high' : tokens >= 8000 ? 'warn' : 'normal';
}

function restoreDraft(textarea: HTMLTextAreaElement) {
  if (textarea.value) return;
  const draft = window.localStorage.getItem(draftKey());
  if (draft) setReactTextareaValue(textarea, draft, draft.length);
}

function installDraftAutosave(textarea: HTMLTextAreaElement, form: HTMLFormElement) {
  if (textarea.dataset.draftAutosave === 'true') return;
  textarea.dataset.draftAutosave = 'true';
  restoreDraft(textarea);
  textarea.addEventListener('input', () => {
    if (textarea.value) window.localStorage.setItem(draftKey(), textarea.value);
    else window.localStorage.removeItem(draftKey());
  });
  form.addEventListener('submit', () => window.localStorage.removeItem(draftKey()));
}

function saveCheckpoint() {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return false;
  window.localStorage.setItem(checkpointKey(), JSON.stringify({ savedAt: Date.now(), raw }));
  return true;
}

function restoreCheckpoint() {
  const stored = window.localStorage.getItem(checkpointKey());
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored) as { raw?: string };
    if (!parsed.raw) return false;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, parsed.raw);
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

function stripFormattingEnvelope(value: string): string {
  return value.trim().replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function formatMyText(textarea: HTMLTextAreaElement, button: HTMLButtonElement) {
  const original = textarea.value;
  if (!original.trim()) return;
  const provider = readStoredSession()?.settings?.provider;
  if (!provider?.model) {
    button.textContent = 'FORMAT FAILED';
    window.setTimeout(() => { button.textContent = 'FORMAT MY TEXT'; }, 1600);
    return;
  }

  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'FORMATTING…';
  try {
    const prompt = [
      'You are a formatting-only editor for a roleplay composer.',
      'Return ONLY the corrected user text. Do not add commentary.',
      'Preserve the wording, meaning, names, order, tone, and content exactly.',
      'Only fix formatting mistakes: spoken dialogue uses straight double quotes, actions/narration use single asterisks, thoughts may use square brackets, accidental ALL CAPS may be normalized when clearly unintended, and punctuation/spacing may be repaired.',
      'Do not rewrite sentences, add detail, remove detail, censor, summarize, continue the scene, or answer the text.',
      '',
      'USER TEXT:',
      original,
    ].join('\n');
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'orbis',
        prompt,
        model: provider.model,
        temperature: 0,
        maxTokens: Math.min(Math.max(provider.maxTokens ?? 512, 128), 2048),
        reroll: false,
      }),
    });
    const body = await response.json() as { text?: string; error?: string };
    if (!response.ok || !body.text) throw new Error(body.error || `HTTP ${response.status}`);
    const formatted = stripFormattingEnvelope(body.text);
    if (!formatted) throw new Error('Formatter returned empty text.');
    setReactTextareaValue(textarea, formatted, formatted.length);
    button.textContent = 'FORMATTED';
  } catch {
    button.textContent = 'FORMAT FAILED';
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = previous || 'FORMAT MY TEXT';
    }, 1400);
  }
}

function makeHelperButton(label: string, title: string, onClick: (button: HTMLButtonElement) => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'composer-helper-button';
  button.textContent = label;
  button.title = title;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => onClick(button));
  return button;
}

function installHelperRow() {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Player turn"]');
  const form = textarea?.closest<HTMLFormElement>('form.composer');
  if (!textarea || !form) return;
  installDraftAutosave(textarea, form);
  if (form.querySelector('.composer-helper-row')) {
    syncContextMeter();
    return;
  }

  const row = document.createElement('div');
  row.className = 'composer-helper-row';
  row.setAttribute('aria-label', 'Roleplay formatting helpers');

  for (const action of FORMAT_ACTIONS) {
    row.append(makeHelperButton(action.label, action.title, () => clickFormatAction(textarea, action.open, action.close)));
  }

  row.append(makeHelperButton('FORMAT MY TEXT', 'Ask the model to repair roleplay formatting without rewriting your wording', (button) => {
    void formatMyText(textarea, button);
  }));

  row.append(makeHelperButton('SAVE CHECKPOINT', 'Save the current simulation state as a local checkpoint', (button) => {
    button.textContent = saveCheckpoint() ? 'CHECKPOINT SAVED' : 'NO SESSION';
    window.setTimeout(() => { button.textContent = 'SAVE CHECKPOINT'; }, 1200);
  }));

  row.append(makeHelperButton('RESTORE LAST', 'Restore the last local checkpoint and reload Speculus', (button) => {
    if (!restoreCheckpoint()) {
      button.textContent = 'NO CHECKPOINT';
      window.setTimeout(() => { button.textContent = 'RESTORE LAST'; }, 1200);
    }
  }));

  const meter = document.createElement('span');
  meter.className = 'composer-context-meter';
  row.append(meter);

  const hint = document.createElement('span');
  hint.className = 'composer-key-hint';
  hint.textContent = 'ENTER SEND · SHIFT+ENTER NEW LINE · TAB EXIT + SPACE';
  row.append(hint);
  form.append(row);
  syncContextMeter();
  syncHelperRow();
}

function syncHelperRow() {
  const row = document.querySelector<HTMLElement>('.composer-helper-row');
  if (row) row.hidden = !loadToggle(CLICKY_FORMAT_KEY);
}

function installVersionLabel() {
  const footer = document.querySelector<HTMLElement>('.chassis-footer');
  if (!footer || footer.querySelector('.speculus-build-version')) return;
  const version = document.createElement('span');
  version.className = 'speculus-build-version';
  version.textContent = `BUILD ${__SPECULUS_VERSION__}`;
  footer.append(version);
}

function installUi() {
  installControlToggles();
  installHelperRow();
  installVersionLabel();
  syncContextMeter();
}

export function installComposerExperiment() {
  installKeyboardBehavior();
  installUi();
  const observer = new MutationObserver(() => installUi());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(syncContextMeter, 1500);
}
