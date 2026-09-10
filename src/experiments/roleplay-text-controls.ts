type RoleplayFontSize = 'small' | 'default' | 'large' | 'xlarge';
type RoleplayLineSpacing = 'compact' | 'normal' | 'relaxed';

const FONT_SIZE_KEY = 'speculus-rp-font-size';
const LINE_SPACING_KEY = 'speculus-rp-line-spacing';

const FONT_SIZES: Record<RoleplayFontSize, string> = {
  small: '0.84rem',
  default: '0.96rem',
  large: '1.08rem',
  xlarge: '1.22rem',
};

const LINE_SPACING: Record<RoleplayLineSpacing, string> = {
  compact: '1.38',
  normal: '1.62',
  relaxed: '1.85',
};

function readFontSize(): RoleplayFontSize {
  const saved = window.localStorage.getItem(FONT_SIZE_KEY);
  return saved === 'small' || saved === 'large' || saved === 'xlarge' ? saved : 'default';
}

function readLineSpacing(): RoleplayLineSpacing {
  const saved = window.localStorage.getItem(LINE_SPACING_KEY);
  return saved === 'compact' || saved === 'relaxed' ? saved : 'normal';
}

function applyPreferences(fontSize: RoleplayFontSize, lineSpacing: RoleplayLineSpacing) {
  document.documentElement.style.setProperty('--rp-font-size', FONT_SIZES[fontSize]);
  document.documentElement.style.setProperty('--rp-line-height', LINE_SPACING[lineSpacing]);
}

function makeSelect<T extends string>(
  value: T,
  options: readonly (readonly [T, string])[],
  onChange: (value: T) => void,
) {
  const select = document.createElement('select');
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  return select;
}

function installUi(): boolean {
  const panel = document.querySelector<HTMLElement>('.display-menu__panel');
  if (!panel) return false;
  if (panel.querySelector('[data-roleplay-text-controls]')) return true;

  let fontSize = readFontSize();
  let lineSpacing = readLineSpacing();

  const heading = document.createElement('span');
  heading.className = 'display-menu__label';
  heading.textContent = 'ROLEPLAY TEXT';
  heading.dataset.roleplayTextControls = 'true';

  const fontLabel = document.createElement('label');
  fontLabel.append('TEXT SIZE');
  fontLabel.append(makeSelect<RoleplayFontSize>(fontSize, [
    ['small', 'SMALL'],
    ['default', 'DEFAULT'],
    ['large', 'LARGE'],
    ['xlarge', 'EXTRA LARGE'],
  ], (next) => {
    fontSize = next;
    window.localStorage.setItem(FONT_SIZE_KEY, next);
    applyPreferences(fontSize, lineSpacing);
  }));

  const spacingLabel = document.createElement('label');
  spacingLabel.append('LINE SPACING');
  spacingLabel.append(makeSelect<RoleplayLineSpacing>(lineSpacing, [
    ['compact', 'COMPACT'],
    ['normal', 'NORMAL'],
    ['relaxed', 'RELAXED'],
  ], (next) => {
    lineSpacing = next;
    window.localStorage.setItem(LINE_SPACING_KEY, next);
    applyPreferences(fontSize, lineSpacing);
  }));

  panel.append(heading, fontLabel, spacingLabel);
  return true;
}

export function installRoleplayTextControls() {
  if (typeof window === 'undefined') return;

  applyPreferences(readFontSize(), readLineSpacing());
  if (installUi()) return;

  const observer = new MutationObserver(() => {
    if (installUi()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
