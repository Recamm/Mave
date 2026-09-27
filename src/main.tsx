import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyAppIconPreference, getAppIconPreference } from './app/appIcon';
import { applyAppearancePreference, getAppearancePreference } from './app/appearance';
import { applyMobileNavigationStyle, getMobileNavigationStyle } from './app/mobileNavigation';
import { registerServiceWorker } from './service-worker-registration';
import './app/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found.');
}

applyAppearancePreference(getAppearancePreference());
applyAppIconPreference(getAppIconPreference());
applyMobileNavigationStyle(getMobileNavigationStyle());
registerServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
