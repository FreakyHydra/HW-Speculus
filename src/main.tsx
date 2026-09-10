import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installComposerExperiment } from './experiments/composer-experiment';
import { installResponseCalibration } from './experiments/response-calibration';
import './styles/index.css';
import './styles/resizable-panels.css';
import './styles/diagnostic-turns.css';
import './styles/live-transcript.css';
import './styles/light-theme-contrast.css';
import './styles/viewport-layout.css';
import './styles/composer-experiment.css';

installComposerExperiment();
installResponseCalibration();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
