import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensureSeedLoaded } from './db/seed-loader';
import { initTheme } from './state/theme';
import './index.css';

initTheme();
// Fire-and-forget. Subsequent useLiveQuery hooks pick up the rows as
// soon as they land. If the load fails we surface to the console; the
// app still renders (just with empty profile/routine lists).
void ensureSeedLoaded().catch((err) => {
  console.error('Seed load failed:', err);
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
