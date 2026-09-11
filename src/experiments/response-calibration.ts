import { RESPONSE_CALIBRATION_KEY } from '../runtime/generation/compile-context';
import { SPECULUS_RESPONSE_MODE_EVENT, type ResponseMode } from '../runtime/brain/contracts';

type Mode = ResponseMode;

const DESCRIPTIONS: Record<Mode, string> = {
  concise: 'Up to 200 output tokens. Usually 1-2 short paragraphs.',
  normal: 'Up to 450 output tokens. Balanced detail.',
  long: 'Up to 850 output tokens. Detailed when useful.',
  adaptive: 'Up to 450 output tokens. Length follows the scene.',
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
    option.textContent = mode === 'concise' ? 'SHORT' : mode.toUpperCase();
    select.append(option);
  }
  select.value = currentMode();

  const hint = document.createElement('small');
  hint.className = 'response-calibration-hint';
  hint.textContent = DESCRIPTIONS[select.value as Mode];

  select.addEventListener('change', () => {
    const mode = select.value as Mode;
    window.localStorage.setItem(RESPONSE_CALIBRATION_KEY, mode);
    window.dispatchEvent(new CustomEvent<ResponseMode>(SPECULUS_RESPONSE_MODE_EVENT, { detail: mode }));
    hint.textContent = DESCRIPTIONS[mode];
  });

  window.addEventListener(SPECULUS_RESPONSE_MODE_EVENT, (event) => {
    const mode = (event as CustomEvent<ResponseMode>).detail;
    select.value = mode;
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
