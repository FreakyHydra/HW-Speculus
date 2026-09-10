const RESPONSE_CALIBRATION_KEY = 'speculus-response-calibration';

type Mode = 'concise' | 'normal' | 'long' | 'adaptive';

const DESCRIPTIONS: Record<Mode, string> = {
  concise: '1-2 short paragraphs. Fast scene progression.',
  normal: '2-4 moderate paragraphs. Balanced detail.',
  long: 'Detailed response when the scene supports it.',
  adaptive: 'Length follows the immediate scene and player input.',
};

function currentMode(): Mode {
  const value = window.localStorage.getItem(RESPONSE_CALIBRATION_KEY);
  return value === 'concise' || value === 'normal' || value === 'long' || value === 'adaptive' ? value : 'adaptive';
}

function installCalibrationControl() {
  const group = document.querySelector<HTMLElement>('.control-group');
  if (!group || group.querySelector('[data-response-calibration]')) return;

  const label = document.createElement('label');
  label.className = 'theme-select';
  label.dataset.responseCalibration = 'true';
  label.append(document.createTextNode('RESPONSE CALIBRATION'));

  const select = document.createElement('select');
  for (const mode of ['concise', 'normal', 'long', 'adaptive'] as const) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode.toUpperCase();
    select.append(option);
  }
  select.value = currentMode();

  const hint = document.createElement('small');
  hint.className = 'response-calibration-hint';
  hint.textContent = DESCRIPTIONS[select.value as Mode];

  select.addEventListener('change', () => {
    const mode = select.value as Mode;
    window.localStorage.setItem(RESPONSE_CALIBRATION_KEY, mode);
    hint.textContent = DESCRIPTIONS[mode];
  });

  label.append(select, hint);

  const modelReadout = [...group.querySelectorAll<HTMLElement>('.data-readout')]
    .find((entry) => entry.textContent?.includes('MODEL'));
  if (modelReadout) modelReadout.insertAdjacentElement('afterend', label);
  else group.prepend(label);
}

export function installResponseCalibration() {
  installCalibrationControl();
  const observer = new MutationObserver(installCalibrationControl);
  observer.observe(document.body, { childList: true, subtree: true });
}
