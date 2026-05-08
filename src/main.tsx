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

// React Router's basename has to match Vite's `base` so the routes
// declared as `/`, `/today`, etc. resolve against the deployed prefix
// (`/workout-tracker/` on GH Pages, `/` in dev). Without this, the
// initial pathname `/workout-tracker/` matches no route, the `*` catch-
// all fires `<Navigate to="/" />`, and the URL silently jumps to the
// origin root — outside the service worker's scope. Pull-to-refresh
// then reloads the wrong page entirely.
//
// `import.meta.env.BASE_URL` is set automatically by Vite from the
// config's `base`. Keep both in sync via that one source.
const routerBase = import.meta.env.BASE_URL;

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={routerBase}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
