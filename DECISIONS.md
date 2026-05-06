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

## 2026-05-06 — Milestone 2: Dexie schema + Strong Curves seed

**Context.** Milestone 2 needed both built-in routines loaded into IndexedDB
on first boot, with a browseable routine detail surface. The source xlsx
ships with a couple of structural quirks that the importer had to handle,
and exercise metadata (muscle tags, rest, barbell flag) isn't in the file.

### Schema

`src/db/db.ts` declares one Dexie database (`workout-tracker`) with nine
tables matching SCOPE.md §4.3: `profiles`, `exercises`, `routineTemplates`,
`sessions`, `setLogs`, `barbells`, `plateInventory`, `bodyweightLogs`,
`prRecords`. Indexes chosen for the queries we already need or will need
soon:
- `setLogs` has a compound `[sessionId+blockOrder+exerciseOrder+setNumber]`
  to render the session screen in canonical order without an in-memory sort.
- `sessions` indexes `[profileId+startedAt]` for fast per-profile history.
- `prRecords` indexes `[profileId+exerciseId+type]` for the PR-detection
  hot path (milestone 7).

Schema migrations are additive, never edited in place. Document each new
`version().stores()` chain here.

### Per-entity query modules

`src/db/{profiles,routines,exercises}.ts` expose typed `useLiveQuery`
helpers so screens don't reach into Dexie directly. Adding more is cheap
when new screens land.

### Seed loader

`src/db/seed-loader.ts` runs once on app boot from `main.tsx`. Profiles
are additive-only (never overwrite a user's edits). Built-in exercises
and routines are *replaced* on every boot — bumping `pnpm seed:build`
propagates without leaving stale rows. Custom rows (`isCustom: true`,
`isSeed: false`) are left alone. Idempotent, safe to re-run.

### Strong Curves importer (scripts/build-seed.py)

Parses each "{Routine} Week {n}" sheet positionally — first workout
section becomes Day 1, second Day 2, third Day 4, fourth Day 5
(SCOPE.md §6/§7's documented A/B/A/C cadence). The source xlsx
mis-labels the third section as "DAY 1" from Bootyful Week 5 and across
all Bodyweight weeks; trusting the position rather than the header
side-steps that bug. Days 3, 6, 7 are explicitly emitted as `kind:
'rest'` so the detail view can render them.

Supersets are detected from `A1:`/`A2:`/`B1:`/`B2:` prefixes. Sets/reps
parse a small grammar: `N sets, X-Y reps`, `1 set (X-Y seconds)`,
optional `(each)` / `(each side)`. Anything past the last (name,
sets/reps) pair is treated as image-anchor noise and skipped.

Exercise metadata not in the spreadsheet (muscle tags, rest seconds,
`usesBarbell`, measurement type) lives in an `EXERCISE_OVERRIDES` dict
inside `build-seed.py`. Unknown exercises fall through to safe defaults
and are listed at the end of the run; 23 of the 50 currently rely on
defaults — to be filled in incrementally.

### Routine browse surface

`/routines` lists templates (built-ins badged). Tapping a card opens
`/routines/:id` — a Fraunces hero, scrollable week tabs (using the
profile's accent colour for the active state), and one card per day.
Workout days show their blocks with superset markers (A1/A2/B1/B2
re-numbered per day so that's stable across sources); rest days render
as a dashed muted card. Reads use the `useLiveQuery` hooks from
`src/db/`, so future Dexie writes (mid-session edits, custom routines)
will repaint live with no extra plumbing.

### Bundle impact

JS grew from 175 kB to 338 kB (95 kB gzipped) — most of it is the seed
data itself (296 blocks × rep ranges). Comfortably under the 300 kB
gzipped budget. If we ever need to slim it, the seed could split into
its own chunk loaded on demand from `/routines`.

---

## 2026-05-06 — Per-profile themes (Hayley gets her own palette)

**Context.** Single-accent profile theming was the ceiling of what
"profile-as-accent" could do — Hayley's coral on a cream substrate
still looked like Joshua's app. Owner asked for a distinct theme for
Hayley anchored on **pale pink + light charcoal**.

**Decision.** Promote the colour system from a single `--accent`
variable to a full set of semantic tokens — `bg`, `surface`,
`surface-soft`, `surface-elevated`, `line`, `line-strong`, `fg`,
`fg-soft`, `fg-muted`, `fg-faint`, `accent`, `accent-fg`. They live
as CSS variables in `src/index.css`, exposed through Tailwind as
real colour utilities (`bg-bg`, `text-fg`, `border-line`, etc.).

The cascade is:
```
:root                              -> Joshua / no-profile, light
html.dark                          -> Joshua / no-profile, dark
html[data-profile="hayley"]        -> Hayley, light
html.dark[data-profile="hayley"]   -> Hayley, dark
```

`[data-profile]` is set by `useActiveProfile.setActiveProfileId` (no
React state involved — the attribute toggle is the source of truth).

### Hayley's palette

The two anchors swap roles between modes:

- **Light:** pale pink surfaces (`#fbe9ed` page, `#fffafb` cards), warm
  light-charcoal text (`#3c3236`), deep-rose accent (`#c52f63`) for CTAs
  / active states.
- **Dark:** warm light-charcoal surfaces (`#2c2628` page, `#383032`
  cards), pale-pink text (`#f8dce2`), brighter pink accent (`#f6a7b2`)
  with charcoal `accent-fg` so pink CTAs read crisply.

Joshua's palette is the same warm cream we already shipped, just
re-expressed through the semantic tokens.

**Alternatives.**
- Keep one global cream palette and just swap accent colour per
  profile. Cheap, but the result felt like wearing the same outfit
  with a different brooch — Hayley's experience didn't read as hers.
- Two separate Tailwind themes (one per profile) compiled separately.
  Heavier; CSS variables give the same outcome with one bundle.

**Consequences.**
- All component code now goes through semantic utilities. Adding a
  third profile is a single CSS block; no component changes required.
- Charts (Recharts, milestone 8) will need to read `--accent` and
  `--fg` for axis / gridlines so they participate in the same theming.
- The static `bg-profile-josh` / `bg-profile-hayley` chip colours stay
  raw hex (sap green / warm coral) — that's the stable, recognisable
  identity in the picker, distinct from the dynamic accent.
- The `cream-{50..950}` primitive scale stays in Tailwind for fallback
  cases (e.g. the no-profile fallback dot) and any future need for a
  literal cream tone, but components shouldn't reach for it directly.

---

## 2026-05-06 — Milestone 3: Workout session core

**Context.** Acceptance was "complete a Workout A end-to-end and see it
dated in History." Out of scope for the milestone (per SCOPE.md §10):
mid-workout edits, rest timer, plate calc, PR celebration, RPE, notes.
Set type defaults to `working` and isn't user-changeable yet.

### Flow

```
Today  ──────────────────────────╮
  └─ Pick a routine              │ (resume card if open session)
                                 ▼
RoutineDetail  ──── Start ───── creates Session, nav /session/:id
                                 │
                                 ▼
Session screen  ── tick sets ── persisted as SetLogs (live via Dexie)
  ├─ Discard      → drops Session + all SetLogs (confirm)
  └─ Finish       → sets completedAt, nav /history
                                 │
                                 ▼
History  ── click row ── /session/:id (read-only completed view)
```

### State strategy

Per CLAUDE.md, Zustand is reserved for ephemeral UI ("the active
timer, the set being entered right now"). The active session is *not*
in Zustand — it's just whatever Session row in Dexie has
`completedAt: null`. `useActiveSession(profileId)` resolves it; Today
and the Discard guard both use it. This keeps the source of truth in
one place and makes the resume affordance trivially correct across
tabs / reloads.

Per-row entry state (in-flight weight, reps, duration before tick) is
local component `useState` inside `SetRow`. Once ticked, the row reads
back from the `useLiveQuery` set-log map and re-renders in completed
mode. Untick deletes the SetLog and the row swaps back to editable.

### No native number inputs

Per CLAUDE.md, weight/reps/time use a custom `NumberStepper` (− value
+ pill). Tap-to-type lands in milestone 4; long-press-to-scrub later.
For now: 2.5 kg per +/-, 1 rep, 5 s. Bodyweight-measured exercises
hide the weight stepper. Time-based (`time_seconds`) swap reps for a
seconds stepper, per SCOPE.md §6.5 / §7.4.

### Defaults that aren't zero

A reps stepper defaulting to zero is hostile — every set requires four
+ taps before you can even tick it. Default reps to the midpoint of
the planned range (e.g. `3 sets, 10–20 reps` → 15) so the user is one
tap from a typical entry. Same for duration (midpoint of seconds
range). Weight stays at 0 until milestone 4 / 7 plumbs in
"last session's weight" lookup.

### Discard / Finish

Both live in a sticky bottom bar that vanishes on a completed session
(read-only mode). Finish sets `completedAt` only; PR detection (which
SCOPE.md §7.7 also schedules here) lives in milestone 7. Discard
nukes the Session and all its SetLogs in one Dexie transaction —
behind a `window.confirm` until we have a proper undo toast (also
milestone 7).

### Things deferred but designed-around

- **Per-side tracking** for `perSide` exercises: currently logged as a
  single SetLog with `side: null`. The schema supports `'left' | 'right'
  | null` so milestone 4 can split into twin ticks without migration.
- **Warmup / activation checklists** (SCOPE.md §6.3 step 1–2): the
  importer doesn't extract them yet. The DayTemplate type already
  has `warmups?` / `activations?` slots — populating from columns
  2–10 of the spreadsheet is a discrete follow-up.
- **Free sessions**: route exists, but `Session` requires a
  `templateRef` to render anything useful right now. Milestone 4.
- **Last-session ghost text** under the steppers: the lookup is cheap
  (Dexie `where({ exerciseId, profileId })` + sortBy completedAt desc,
  take 1) but defers to milestone 4.

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
