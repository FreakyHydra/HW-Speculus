import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { V2App } from './ui/App';
import './ui/terminal.css';
import './ui/roleplay-colors.css';

createRoot(document.getElementById('root')!).render(<StrictMode><V2App /></StrictMode>);
