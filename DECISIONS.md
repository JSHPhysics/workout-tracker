# Decisions

A running log of cross-cutting decisions. Mirror format from the Revision
Tracker: each entry has date, context, decision, alternatives, consequences.
Open questions live at the bottom — don't guess silently.

---

## 2026-05-06 — Build tool: Vite + React (over SvelteKit)

**Context.** Need a static-output SPA with installable PWA support, deployable
to GitHub Pages, and quick to iterate on. Owner already familiar with React +
Vite from the Revision Tracker project.

**Decision.** Vite 5 + React 18 + TypeScript strict.

**Alternatives.**
- SvelteKit — smaller bundle ceiling, idiomatic for offline-first, but a
  fresh learning curve and a less direct path to the Recharts-style charting
  the Progress screen needs.
- Next.js — too much framework for a no-backend, fully-static app.

**Consequences.** Pay a Recharts/React bundle-size tax (budget relaxed to
300 kB gzipped per SCOPE.md §8). Familiarity wins on velocity.

---

## 2026-05-06 — Storage: Dexie (over raw IndexedDB or SQLite-WASM)

**Context.** Need a typed, observable IndexedDB layer with versioned migrations
and a clean React integration.

**Decision.** Dexie.js with `dexie-react-hooks` (`useLiveQuery`).

**Alternatives.**
- Raw IDB / `idb` — too much boilerplate for the entity count we expect.
- Drizzle on SQLite-WASM — overkill for a single-device app and ships ~1 MB
  of WASM into the bundle, blowing the budget for no clear gain.

**Consequences.** Schema migrations are additive via `version().stores()`
chains; never edit a past version (CLAUDE.md). Each migration is documented
here.

---

## 2026-05-06 — Pure-domain modules separated from UI

**Context.** PR detection, plate calculation, e1RM, streak, volume, and
auto-warmup heuristics are the load-bearing logic — UI bugs are cheap, but
domain bugs in these destroy trust in the historical data.

**Decision.** Pure TS in `src/domain/`, no React, no Dexie, fully unit-tested
with Vitest. UI consumes them via thin hooks.

**Alternatives.** Inline the logic into screen components. Faster initially,
much harder to test and easy to drift between callers.

**Consequences.** Slight ceremony for callers; large win on testability and
on resilience when the JSON importer recomputes PRs from set logs.

---

## 2026-05-06 — Profile-picker state is in-memory (milestone 1 only)

**Context.** Milestone 1 ships a hardcoded two-profile picker with no
persisted state, ahead of the Dexie schemas in milestone 2.

**Decision.** Zustand store `useActiveProfile` holds the active profile id in
memory. Reloading the tab returns to the picker.

**Alternatives.** localStorage — would have to be torn out when the real
profile records arrive. Not worth it for the milestone-1 surface.

**Consequences.** Once profile records live in Dexie, this store either goes
away or shrinks to "currently-selected profile id" backed by Dexie. Zustand
is reserved for ephemeral UI state per CLAUDE.md.

---

## 2026-05-06 — Tailwind dark mode follows the OS

**Context.** SCOPE.md §9 says dark mode is the default; CLAUDE.md says light
mode follows `prefers-color-scheme`. There is no in-app toggle in v1.

**Decision.** Tailwind `darkMode: 'media'` (no class strategy, no toggle).

**Alternatives.** `darkMode: 'class'` plus an explicit toggle in Settings.
Defer to a later milestone if a "high-contrast for gym lighting" preference
gets prioritised — that may want explicit override semantics anyway.

**Consequences.** Theme changes follow the OS instantly; no flash from
hydration mismatch; nothing to persist.

---

## Open questions (no decision yet)

These are flagged so they don't get lost. Resolve before the milestone in
parentheses.

- **Final repo name** *(working: `workout-tracker`)* — confirm before the
  GitHub Pages action lands (milestone 12).
- **Colour palette and primary accent** — picker placeholders today are
  violet (`#7c3aed`) and sky (`#0ea5e9`). Pick a real palette before
  Progress charts render at scale (milestone 8).
- **Default plate inventory** — UK home-gym standard (1.25 / 2.5 / 5 / 10 /
  15 / 20 kg pairs) is the working assumption per SCOPE.md §6.4. Confirm
  before milestone 6 (plate calculator).
- **Volume-by-muscle weighting for secondary muscles** — primary at 100%;
  secondary at 50%? 33%? 0%? Need by milestone 8.
- **Auto-warmup heuristic threshold and on/off default** — SCOPE.md §7.6
  suggests `< 60%` of session top set. Need by milestone 7.
- **Per-exercise barbell override** — currently deferred per SCOPE.md §11;
  flag for revisit once the plate calculator lands and we see whether the
  partner's training (different bar weight) materially differs.
- **Third built-in template (PPL?)** — SCOPE.md §12. Decide before
  milestone 11 (custom routine builder); affects how forking presents.
- **Calendar heatmap default range** — 12 weeks vs full year. Need by
  milestone 8.
