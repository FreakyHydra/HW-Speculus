import { installComposerExperiment } from './composer-experiment';

/**
 * Install the composer helpers while guarding against observer feedback loops.
 *
 * The experiment watches the app for the terminal/composer to appear after the
 * boot screen. Once installed, however, it also updates helper-row text such as
 * the context meter. Those helper mutations must never be allowed to retrigger
 * installUi(), or the browser can get trapped in a MutationObserver loop.
 */
export function installComposerSafely() {
  const NativeMutationObserver = window.MutationObserver;

  class SafeMutationObserver extends NativeMutationObserver {
    constructor(callback: MutationCallback) {
      super((records, observer) => {
        const meaningful = records.filter((record) => {
          const target = record.target instanceof Element
            ? record.target
            : record.target.parentElement;

          // Ignore mutations produced by Speculus' own injected helper UI.
          // Structural React mutations elsewhere in the app still reach the
          // original callback so the composer can be installed after boot.
          return !target?.closest('.composer-helper-row, .speculus-build-version');
        });

        if (meaningful.length > 0) callback(meaningful, observer);
      });
    }

    override observe(target: Node, options: MutationObserverInit = {}) {
      // Text-node changes are never needed to discover the composer and can
      // create unnecessary observer churn.
      super.observe(target, { ...options, characterData: false });
    }
  }

  window.MutationObserver = SafeMutationObserver;
  try {
    installComposerExperiment();
  } finally {
    window.MutationObserver = NativeMutationObserver;
  }
}
