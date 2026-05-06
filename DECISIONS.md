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

## 2026-05-06 — Tailwind dark mode: explicit toggle, OS as default

**Context.** SCOPE.md §9 says dark mode is the default; CLAUDE.md says light
mode follows `prefers-color-scheme`. Initial milestone-1 implementation used
`darkMode: 'media'` with no toggle. Owner pushed back: wants light mode
reachable from the start, not gated on OS settings.

**Decision.** Tailwind `darkMode: 'class'`. A small three-state preference
(`light` / `system` / `dark`) lives in `src/state/theme.ts`, persisted to
`localStorage` under `wt:theme`, applied to `<html>` via the `dark` class
and `color-scheme` style. Default is `system`, which tracks
`prefers-color-scheme` live (re-evaluates on OS change). A segmented
`ThemeToggle` is surfaced in the app header **and** the profile picker so
the choice is reachable on first launch.

**Alternatives.**
- Two-state toggle (light/dark only) — slightly simpler, but loses the
  "follow my phone" affordance most users expect.
- Toggle only in Settings — fewer pixels in the header, but hides the
  control behind several taps and removes it from the picker entirely.

**Consequences.** Theme is now persisted state living in `localStorage`,
not Dexie — fine, it's a UI preference, not domain data. A class is set on
`<html>` before React mounts (`initTheme()` called in `main.tsx`) to avoid
a flash of wrong theme.

---

## 2026-05-06 — Visual identity: warm-editorial, profile as accent

**Context.** Owner pushed back on the placeholder violet/sky picker — wants
a personal-use aesthetic that's "modern, but stylish", not the educational
look of the Revision Tracker. Also renamed second profile Partner →
Hayley.

**Decision.** Commit to a small but opinionated design system:

- **Type.** Two variable fonts, bundled via `@fontsource-variable/*`
  (zero network at runtime, fits the offline-first PWA brief).
  - Body: **Inter Variable** (`font-sans`) — UI workhorse, tabular figures.
  - Display: **Fraunces Variable** (`font-display`) — italic-leaning serif
    with optical sizing, used for hero headlines and small editorial
    accents (e.g. "Soon." on placeholders).
- **Palette.** Replaced Tailwind's `slate` with a warm-neutral `cream`
  scale (50–950). Backgrounds are a warm cream (`#faf8f3`) in light and
  a warm near-black (`#0c0a08`) in dark — neither is pure white/black.
- **Profile-as-accent.** Each profile owns a colour. The active profile
  themes the entire app via CSS variables: `--accent` and `--accent-fg`
  bound by a `[data-profile]` attribute on `<html>` (set by
  `useActiveProfile`). Tailwind's `accent` colour reads those variables,
  so `text-accent`, `bg-accent`, `bg-accent-soft` flow through every
  surface. The picker stays neutral (default champagne) until a profile
  is chosen, at which point the chrome (active tab indicator, eyebrows,
  selection highlight) re-paints itself.
  - Joshua: **`#22c55e`** sap green
  - Hayley: **`#fb7185`** warm coral
- **Iconography.** Unicode glyphs for now (◎ ☰ ↗ ✦ ⚙). Real icons
  deferred to milestone 12 polish; we'll likely adopt Lucide.

**Alternatives.**
- A single brand accent across both profiles. Loses the immediate "this
  is mine" cue when switching profiles, which is one of two-profile
  design's small wins.
- System fonts only. Cheaper, but the picker hero needed a display face
  to feel intentional and `font-stack:` system serifs vary too much.
- Self-host fonts manually. `@fontsource-variable/*` is npm-managed,
  tree-shakeable, version-pinned — same outcome, less maintenance.

**Consequences.**
- Bundle grew (variable WOFFs add ~80 kB to the final build). Still
  comfortably under the 300 kB JS budget; CSS budget unaffected.
- Charts (Recharts, milestone 8) will need explicit colour passes that
  reference `--accent` so they participate in profile theming.
- The CSS-variable colour scheme means we can't use Tailwind's
  arbitrary-value `bg-[#hex]` shorthand for the accent — must go through
  `bg-accent` / `text-accent` etc. Documented for future contributors.

---

## Open questions (no decision yet)

These are flagged so they don't get lost. Resolve before the milestone in
parentheses.

- **Final repo name** *(working: `workout-tracker`)* — confirm before the
  GitHub Pages action lands (milestone 12).
- ~~Colour palette and primary accent~~ — settled 2026-05-06; see
  "Visual identity" entry above. Profile-as-accent: Joshua green, Hayley
  coral, warm cream surface palette, profile-driven via CSS variables.
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
