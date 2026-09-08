import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';
import './styles/resizable-panels.css';
import './styles/diagnostic-turns.css';
import './styles/live-transcript.css';
import './styles/light-theme-contrast.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
