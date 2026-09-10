import { installComposerExperiment } from './composer-experiment';

/**
 * Install the composer helpers while guarding against characterData observation.
 * The composer updates its context meter text itself; observing those text-node
 * changes would recursively call installUi() and can lock the page during boot.
 */
export function installComposerSafely() {
  const NativeMutationObserver = window.MutationObserver;

  class SafeMutationObserver extends NativeMutationObserver {
    override observe(target: Node, options: MutationObserverInit = {}) {
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
