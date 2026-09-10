const AUTO_SCROLL_KEY = 'speculus-auto-scroll';

function isEnabled(): boolean {
  return window.localStorage.getItem(AUTO_SCROLL_KEY) !== 'false';
}

function installToggle() {
  const group = document.querySelector<HTMLElement>('.control-group');
  if (!group || group.querySelector('[data-auto-scroll-toggle]')) return;

  const label = document.createElement('label');
  label.className = 'toggle composer-experiment-toggle';
  label.dataset.autoScrollToggle = 'true';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isEnabled();
  input.addEventListener('change', () => {
    window.localStorage.setItem(AUTO_SCROLL_KEY, String(input.checked));
  });

  label.append(input, document.createTextNode(' AUTO SCROLL'));

  const existingToggles = [...group.querySelectorAll<HTMLLabelElement>('label.toggle')];
  const lastToggle = existingToggles.at(-1);
  if (lastToggle) lastToggle.insertAdjacentElement('afterend', label);
  else group.append(label);
}

export function installAutoScrollToggle() {
  installToggle();
  const observer = new MutationObserver(() => installToggle());
  observer.observe(document.body, { childList: true, subtree: true });
}
