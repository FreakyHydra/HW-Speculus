import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';
import './styles/resizable-panels.css';
import './styles/diagnostic-turns.css';
import './styles/live-transcript.css';
import './styles/light-theme-contrast.css';
import './styles/viewport-layout.css';

function installComposerKeyboardShortcut() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.getAttribute('aria-label') !== 'Player turn') return;
    if (!target.value.trim()) return;
    const form = target.form;
    const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
    if (!form || submitButton?.disabled) return;
    event.preventDefault();
    form.requestSubmit();
  });
}

installComposerKeyboardShortcut();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
