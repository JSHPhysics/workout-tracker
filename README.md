# Workout Tracker

A personal, single-device, two-profile workout tracker. Web/PWA, no auth, no
backend. IndexedDB + JSON export/import for durability. Hosted on GitHub Pages.

- **Spec:** [SCOPE.md](./SCOPE.md) — authoritative; read before any major change.
- **Operating manual:** [CLAUDE.md](./CLAUDE.md) — conventions, stack, do-not-do.
- **Decisions log:** [DECISIONS.md](./DECISIONS.md) — open questions live here too.

Strong Curves ships as one of two built-in routine templates; it is **not** the
app's identity. The app is a generic tracker that can run any routine.

## Stack

Vite 5 · React 18 · TypeScript (strict) · Tailwind · Dexie · Zustand · Recharts
· React Router · vite-plugin-pwa · pnpm · Node 20 LTS.

## Develop

```sh
pnpm install
pnpm dev          # local dev server
pnpm build        # static dist/
pnpm preview      # serve the build
pnpm test         # vitest (domain modules)
pnpm lint
pnpm seed:build   # regenerate src/seed/strongCurves.ts from .xlsx
```

## Status

Milestone 1 (scaffold) complete. See SCOPE.md §10 for the milestone roadmap.
