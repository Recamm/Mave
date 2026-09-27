import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyAppearancePreference, getAppearancePreference } from './app/appearance';
import { registerServiceWorker } from './service-worker-registration';
import './app/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found.');
}

applyAppearancePreference(getAppearancePreference());
registerServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
