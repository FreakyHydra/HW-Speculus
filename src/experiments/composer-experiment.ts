const SMART_PAIRS_KEY = 'speculus-smart-pairs';
const CLICKY_FORMAT_KEY = 'speculus-clicky-format-keys';

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

function loadToggle(key: string): boolean {
  return window.localStorage.getItem(key) !== 'false';
}

function isPlayerComposer(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.getAttribute('aria-label') === 'Player turn';
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
  if (selected) {
    setReactTextareaValue(textarea, next, start + 1, end + 1);
  } else {
    setReactTextareaValue(textarea, next, start + 1);
  }
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

  // A real selection is always explicit: wrap exactly what the user selected.
  if (start !== end) {
    wrapSelection(textarea, open, close);
    return;
  }

  // If the caret is inside an empty smart pair, clicking another format means
  // "finish this segment and start the next one". Keep the existing pair,
  // jump outside it, add one separator space, then open the newly requested pair.
  const emptyPair = enclosingPairAtCaret(textarea);
  if (emptyPair) {
    if (emptyPair.open === open && emptyPair.close === close) {
      textarea.focus();
      textarea.setSelectionRange(emptyPair.end, emptyPair.end);
      return;
    }

    const before = textarea.value.slice(0, emptyPair.end);
    const after = textarea.value.slice(emptyPair.end);
    const hasFollowingSpace = /^\s/.test(after);
    const spacer = hasFollowingSpace ? '' : ' ';
    const next = `${before}${spacer}${open}${close}${after}`;
    const pairStart = emptyPair.end + spacer.length;
    setReactTextareaValue(textarea, next, pairStart + 1);
    return;
  }

  const nextChar = textarea.value[start] ?? '';
  const previousChar = textarea.value[start - 1] ?? '';

  // If the caret is already immediately before the requested closer, the same
  // format button acts like a convenient "finish span" control.
  if (nextChar === close) {
    textarea.focus();
    textarea.setSelectionRange(start + 1, start + 1);
    return;
  }

  // If the caret is directly after a completed formatted span, start the next
  // format beside it. At end-of-input add a separator automatically; if the
  // user already typed whitespace, reuse it rather than doubling it.
  const completedCloser = previousChar === '*' || previousChar === '"' || previousChar === ']';
  if (completedCloser) {
    const after = textarea.value.slice(start);
    const hasFollowingSpace = /^\s/.test(after);
    const spacer = hasFollowingSpace ? '' : ' ';
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

  // Space always remains normal typing. Tab is the unambiguous fast escape
  // when the caret is directly before a smart-pair closer.
  if (event.key === 'Tab' && start === end && (nextChar === '*' || nextChar === '"' || nextChar === ']')) {
    event.preventDefault();
    textarea.setSelectionRange(start + 1, start + 1);
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
  if (!crtToggle) return;

  const smart = makeToggle('SMART PAIRS', SMART_PAIRS_KEY);
  const clicky = makeToggle('CLICKY FORMAT KEYS', CLICKY_FORMAT_KEY);
  crtToggle.insertAdjacentElement('afterend', clicky);
  crtToggle.insertAdjacentElement('afterend', smart);
}

function installHelperRow() {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Player turn"]');
  const form = textarea?.closest<HTMLFormElement>('form.composer');
  if (!textarea || !form || form.querySelector('.composer-helper-row')) return;

  const row = document.createElement('div');
  row.className = 'composer-helper-row';
  row.setAttribute('aria-label', 'Roleplay formatting helpers');

  for (const action of FORMAT_ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'composer-helper-button';
    button.textContent = action.label;
    button.title = action.title;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => clickFormatAction(textarea, action.open, action.close));
    row.append(button);
  }

  const hint = document.createElement('span');
  hint.className = 'composer-key-hint';
  hint.textContent = 'ENTER SEND · SHIFT+ENTER NEW LINE · TAB EXIT PAIR';
  row.append(hint);
  form.append(row);
  syncHelperRow();
}

function syncHelperRow() {
  const row = document.querySelector<HTMLElement>('.composer-helper-row');
  if (row) row.hidden = !loadToggle(CLICKY_FORMAT_KEY);
}

function installUi() {
  installControlToggles();
  installHelperRow();
}

export function installComposerExperiment() {
  installKeyboardBehavior();
  installUi();

  const observer = new MutationObserver(() => installUi());
  observer.observe(document.body, { childList: true, subtree: true });
}
