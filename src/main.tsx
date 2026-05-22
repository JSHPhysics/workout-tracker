import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ensureSeedLoaded } from './db/seed-loader';
import {
  consolidateAliasedExercises,
  repairRetrospectiveSetTimestamps,
} from './db/sessions';
import { initTheme } from './state/theme';
import { requestPersistentStorage } from './lib/persistentStorage';
import './index.css';

initTheme();

// Ask the browser to protect our IndexedDB from automatic eviction under
// storage pressure. Without this an origin is "best-effort" and the
// browser may silently drop the user's whole local DB to reclaim space —
// the JSON backup is the only other line of defence. Fire-and-forget;
// idempotent (skips the request if already granted). Logs only the
// non-ideal outcomes so a granted boot stays quiet.
void requestPersistentStorage().then((status) => {
  if (status !== 'persisted') {
    // eslint-disable-next-line no-console
    console.info(`Persistent storage not granted (${status}).`);
  }
});
// Fire-and-forget. Subsequent useLiveQuery hooks pick up the rows as
// soon as they land. If the load fails we surface to the console; the
// app still renders (just with empty profile/routine lists).
//
// Boot housekeeping runs sequentially after the seed load:
//   1. consolidateAliasedExercises — rewrites references in user
//      data (setLogs, PRs, sessions, custom routines, per-pair
//      tables) from old aliased exercise ids to canonical ones.
//   2. repairRetrospectiveSetTimestamps — fixes setLog completedAt
//      values left by the v1 retrospective-logging bug.
// Both are idempotent — once data is clean they're cheap no-ops.
void ensureSeedLoaded()
  .then(async () => {
    const aliased = await consolidateAliasedExercises();
    if (aliased > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `Consolidated ${aliased} reference${aliased === 1 ? '' : 's'} to aliased exercises.`,
      );
    }
    const fixed = await repairRetrospectiveSetTimestamps();
    if (fixed > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `Repaired ${fixed} retrospective set log timestamp${fixed === 1 ? '' : 's'}.`,
      );
    }
  })
  .catch((err) => {
    console.error('Boot housekeeping failed:', err);
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
