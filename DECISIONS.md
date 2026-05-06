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

## 2026-05-06 — Milestone 4: Free sessions + mid-workout editing

**Context.** Acceptance was "can deviate from any plan and have logs
reflect reality" — so the session screen needed to (a) start from
nothing for free sessions, and (b) be safely mutable mid-workout
without touching the underlying routine template.

### Per-session `livePlan` (Dexie v2)

Single biggest move: each `Session` carries its own `livePlan: Block[]`.
- For templated sessions, `Start` snapshots the routine day's blocks
  via `structuredClone` into livePlan. The routine template is now
  read-only from the session's perspective.
- For free sessions, `livePlan` starts as `[]`.
- Mid-session edits (`appendBlock`, `swapExercise`, `setBlockSkipped`,
  `changeSetCount`) mutate livePlan; the routine template never moves.
- Schema bumped to v2 with an upgrader that backfills existing v1
  sessions: templated rows snapshot from their routine, free rows
  get `[]`. No new indexes — `livePlan` is just JSON inside the row.

Why per-session and not "deltas against the template": deltas keep
the routine as source of truth but make every render do a merge.
Snapshot is bigger on disk (~hundreds of bytes per session) and
lets the render path be a flat traversal. For a single-device app,
the trade-off is obvious.

### Editing affordances

Inline buttons rather than long-press, for milestone 4. Long-press is
finicky on web and would require gesture infrastructure we don't yet
need. Per-exercise: `Swap` / `− Set` / `+ Set` buttons in a small
row beneath the set list. Per-block: `Skip block` / `Resume` button
in the block header. Session-wide: `+ Add exercise` button (plus the
empty-state CTA in free sessions).

Long-press menus may come back in milestone 11/12 polish if the inline
controls feel cluttered with notes/RPE on the same row.

### Swap preserves target structure

When swapping an exercise mid-session, we keep the existing
`setCount` / `reps` / `durationSeconds` / `perSide` / `notes` and
just substitute the `exerciseId` — usually a swap is "I don't have
the bar today, give me the dumbbell variant", not "I want to do
something completely different." If the new exercise's measurement
type can't carry the old structure (e.g. swapping a weight-and-reps
lift for a time-based plank), we fall back to the new exercise's
sensible defaults but keep the old `setCount`. See
`mergePlanForSwap` in [src/screens/Session.tsx](src/screens/Session.tsx).

### Set-type chip

Each `SetRow` carries a small two-letter chip (`W` / `WU` / `D` /
`F` / `A+`). Tap to cycle. For uncompleted rows the change is
in-flight (used when the row is ticked); for completed rows it
persists immediately via `updateSetType` so a mistakenly-tagged set
can be re-classified without an undo. PR detection (milestone 7)
respects only `working` and `amrap` per SCOPE.md §7.7 — the schema
already carries the field, so milestone 7 is purely additive.

### Exercise picker

Bottom-sheet style modal, fixed at the bottom of the viewport. Custom
text input for search (text inputs are fine — only `<input
type="number">` is banned per CLAUDE.md). Searches name, category,
and primary muscles. Closes on backdrop click or Esc. Used for both
add and swap (a `title` prop differentiates the header eyebrow).

### Things deferred from the milestone-4 surface area

- **Per-exercise notes editing** in-session — listed in SCOPE.md §6.3
  for the long-press menu; defers to milestone 7 alongside RPE / per-set
  notes (it's a single UI gesture so they ship together).
- **Last-session ghost text** under steppers — needs an exercise-history
  query that's better written once we have PR detection cached
  (milestone 7).
- **Per-side L/R splits** — schema supports it, UI defers; today every
  set logs as a single row with `side: null`, which under-reports per-
  side reps but won't lose data.
- **Reorder blocks / exercises** — out of scope; user can always
  add/skip to achieve the same effect.

---

## 2026-05-06 — Milestone 5: Rest timer + standalone Timers

**Context.** Acceptance was "timer auto-starts on set tick and survives
screen lock; EMOM/Tabata works." Two surfaces ship together:
- **Rest timer** — sticky bar inside Session, auto-armed on each tick
- **Standalone Timers** screen — stopwatch / countdown / interval
  (covering EMOM and Tabata via presets)

### Wall-clock deadlines, not decremented counters

Both timers store a wall-clock `deadline = Date.now() + remainingMs`,
not "seconds left" decremented every tick. The render loop computes
`remaining = deadline − Date.now()` each frame, so backgrounding the
tab doesn't desync the timer. When paused, we stash `pausedRemaining`
(ms) instead — resume re-bases the deadline against the new `Date.now()`.

A `visibilitychange → visible` listener in the bar pokes `setNow` on
return so the ring snaps to the right value immediately rather than
waiting for the next 100ms tick.

### Rest-timer state lives in Zustand

`useRestTimer` is the canonical "ephemeral active timer" Zustand
mention from CLAUDE.md. The bar subscribes; `SetRow.tick()` calls
`startRest(seconds, label)` after persisting the SetLog. Rest-seconds
resolution order:
1. `planned.restSeconds` (per-slot override; not yet user-editable)
2. `exercise.defaultRestSeconds` (from seed metadata)
3. `GLOBAL_DEFAULT_REST_S = 90` (settings UI in milestone 12)

Warm-up sets don't auto-start a rest — `if (setType !== 'warmup')`
gates the call.

### Wake Lock + Page Visibility recovery

`src/lib/wakeLock.ts` is a thin wrapper around `navigator.wakeLock`.
The hook `useWakeLock(active)` acquires while `active` is true and
releases on cleanup. Browsers auto-release wake locks when the tab
hides; the wrapper re-acquires on `visibilitychange → visible`
provided the consumer still wants the lock. Wake locks are held for
the **rest period only** (not the whole session) so the screen can
sleep between exercises. Falls back to a no-op when the API is
missing (older Safari, Firefox).

### Audio + vibration cue

`src/lib/cue.ts` synthesises chimes via Web Audio (no asset files,
keeps the bundle offline-clean). `cueRestEnd` plays a two-note
ascending chime + a `[110, 60, 140]` vibration burst; `cueTick` is
a single beep used for interval round transitions; `cueIntervalEnd`
is a longer triple-note pattern.

`primeAudio()` is called from inside `SetRow.tick()` so the
`AudioContext` is created during a user gesture (Safari requires
this to ever play sound). Settings UI for audio/vibration toggles
defers to milestone 12; defaults are on.

### Bar layout vs the existing Discard/Finish bar

The session screen already had a sticky Discard/Finish bar at the
bottom. The rest bar floats above it (offset = `safe-area-inset-bottom
+ 5rem`) so both stay reachable simultaneously. Rendered as `null`
when status is idle, so the bottom inset is freed.

### Timers screen — three modes, one route

`/timers`. Tab strip: Stopwatch / Countdown / Interval. Default
landing tab is Interval (most useful — that's the EMOM/Tabata case).
Three preset chips (EMOM 60×0×10, Tabata 20×10×8, 40/20×8) flip the
config in one tap. A configured "Total" readout sums to the right of
the rounds stepper so the user can ballpark before starting.

While running, the configuration UI is replaced with a 200px
circular progress ring + Round X/Y indicator. Phase transitions
(work → rest, round → round) play a tick cue; final round ends with
the longer interval-end cue.

Standalone timers all use `useWakeLock` while running. A separate
hook means none of them step on the rest-timer wake lock.

### Things deferred

- **Settings toggles** for audio + vibration — milestone 12.
- **Per-profile global rest default** — milestone 12 alongside the
  Settings page, hardcoded to 90s today.
- **Lap times** in stopwatch — out of scope.
- **Lead-in / 3-2-1 countdown** before interval start — out of scope;
  user can pick a preset and tap Start.

---

## 2026-05-06 — Milestone 6: Plate calculator + equipment

**Context.** Acceptance was "setting target weight shows correct plate
load-out; closest-achievable suggestion works." Three surfaces ship
together: the pure domain solver, an inline viz under barbell SetRows,
and a Settings → Equipment page (barbells + plate inventory + Test
widget).

### Algorithm: subset-sum, not greedy

Initial pass used greedy-down (heaviest plate first) plus an "upgrade"
fallback for the closest-above. Greedy gives the exact answer when one
exists, but the upgrade fallback didn't always find the most elegant
composition — e.g. it produced `[1.25, 1.25]` per side when `[2.5]`
would do. Replaced with a subset-sum enumeration that:
1. Halves total inventory counts to per-side counts.
2. Walks plate weights descending, building a `Map<perSideTotal,
   plates[]>` of every reachable load. Heaviest-first walk means the
   first composition we record for any total is already canonically
   ordered.
3. Picks the reachable total nearest the target. Tie-break: prefer
   the lower total so the user never gets surprise extra weight.

State space is tiny for realistic inventories (UK home-gym = ~30–40
distinct totals), so the enumeration is essentially free. 13
test cases in [src/domain/plate-calculator.test.ts](src/domain/plate-calculator.test.ts)
pin the behaviour: exact, under-bar, empty inventory, fractional plates,
inventory limits, odd-count plates (rounded down to pairs), and the
two closest-achievable directions.

### Defaults: UK home-gym (now logged, was an open question)

Closed the open question on default plate inventory. Per-profile seed
on first boot:
- Barbells: Olympic 20 kg (default) + Women's 15 kg.
- Plates: 4× 20 kg, 2× 15 kg, 4× 10 kg, 2× 5 kg, 4× 2.5 kg, 4× 1.25 kg
  (counts are total across both sides).

Seed loader writes equipment **additively only** — once a profile has
any barbell or plate row, the seeder leaves the equipment alone.
User's adjustments stick across `pnpm seed:build` re-runs.

### Inline viz on SetRow

`PlateViz` mirrors the load around a thin "sleeve" element. Plates
render as sized rectangles (heavier = taller, slightly wider) with
the weight printed inside. Three states:
- **exact** — viz only, no caption.
- **closest** — caption: `Closest achievable: X kg (±delta)`.
- **under-bar** / **empty-inventory** — viz collapses to just the
  bar; explanatory caption.

Only renders when `exercise.usesBarbell && weight > 0`. The viz
appears below the steppers, separated by a hairline. Bar weight comes
from the profile's default barbell; per-exercise barbell override
remains deferred per SCOPE.md §11.

### Equipment surface

`Settings → Equipment` page splits into three articles:
- **Barbells** — list with inline edit (name + weight steppers),
  default-marker action, delete-with-confirm. Adding a bar opens an
  inline form in the same card. If the user deletes the default,
  the heaviest remaining bar gets promoted automatically.
- **Plate inventory** — fixed list of standard weights (25 / 20 / 15 /
  10 / 5 / 2.5 / 1.25 kg), each row a pair-stepping number stepper.
  Step is 2 (one pair). Setting a count to 0 removes the entry from
  the persisted inventory.
- **Test it** — target stepper + live `PlateViz`. Pinned to the
  default barbell.

### Things deferred

- **Per-exercise barbell override** (e.g. EZ-curl bar for biceps work)
  — still SCOPE.md §11 deferred. The PlateViz is bar-aware so a future
  override is a one-prop change.
- **Custom plate weights** — only the standard 7 sizes are exposed in
  the editor today. Adding e.g. 1 kg fractional plates means extending
  `STANDARD_WEIGHTS` and the seed.
- **Plate colours** — schema has the slot (`PlateInventoryEntry.color`)
  but the viz uses neutral monochrome so it works on Hayley's pink and
  Joshua's cream alike. Colour-coded plates revisit in milestone 12 polish.

---

## 2026-05-06 — Milestone 7: PR detection + RPE + per-set notes

**Context.** Acceptance was "PRs surface immediately on session finish;
RPE/notes editable per set without cluttering the row." Two new pure
domain modules (`e1rm`, `pr-detection`) plus DB-layer wiring on
`finishSession`, plus three UI surfaces: celebration modal, per-set PR
badges, and a row-expand affordance for RPE + notes.

### e1RM: Epley, capped at 12 reps

`weight × (1 + reps/30)` is the Epley formula. Returns `null` for
non-strength rep ranges (>12) — past 10–12 reps the estimate is
endurance noise, not strength, and surfacing a fake "1RM PR" off a 20-
rep set would erode trust. Also returns `null` for non-positive inputs
so callers don't have to pre-filter. Single-rep case short-circuits to
the lifted weight (avoids fp drift). 5 tests in
[src/domain/e1rm.test.ts](src/domain/e1rm.test.ts).

### PR detection: four types, one award per (set, type)

`detectPRs` walks the session's qualifying set logs (working/AMRAP only,
both weight and reps required) and emits one award per achievement.
Four types per SCOPE.md §7.7:
- **weight** — heaviest weight ever lifted on this exercise (any reps).
- **reps_at_weight** — more reps at a weight you've already hit before.
  Crucially, *only* awarded when the prior reps-at-this-weight count is
  > 0 — otherwise it's a fresh weight and the `weight` PR already
  covers it. This avoids double-celebrating "first ever 60×5" as both
  a weight PR and a reps PR.
- **e1rm** — best Epley estimate. Set after set, the running best
  inside a single session is tracked so multiple ascending sets each
  award their own PR.
- **session_volume** — total kg·reps for this exercise across the
  whole session, beating the previous per-session best. One award per
  exercise, attached to the heaviest qualifying set so the PR badge
  surfaces somewhere visible.

Multiple PRs in one ascending session (100×5 → 110×5 → 120×3) all
surface — the in-session running best updates after each award. 11
tests in [src/domain/pr-detection.test.ts](src/domain/pr-detection.test.ts).

### Detection runs in `finishSession`, sorted by plan position

Wired into the same Dexie transaction as the `completedAt` stamp:
1. Load this session's set logs.
2. **Sort by `[blockOrder, exerciseOrder, setNumber]`.** Dexie's
   `toArray()` returns rows in primary-key (UUID) order. Without the
   sort, `detectPRs` could see an exercise's heaviest set first and
   silently absorb the intermediate weight PRs. Caught during
   end-to-end verify; regression-tested in
   [pr-detection.test.ts](src/domain/pr-detection.test.ts) under
   "respects the input order".
3. Build per-exercise `PriorBaselines` from the profile's full prior
   history (excluding this session).
4. Run `detectPRs`, persist `PRRecord` rows, annotate each `SetLog`
   with its `prTypes`, cache `Session.prCount`.

`finishSession` returns the award list so the screen can drive the
celebration modal without an extra round trip to Dexie.

### RPE/notes: Dexie typing escape hatch

Clearing an optional field in Dexie means writing `undefined`, but
under TS `exactOptionalPropertyTypes: true` Dexie's `UpdateSpec` rejects
that union member. The two `update*` helpers in
[src/db/setLogs.ts](src/db/setLogs.ts) cast the spec to
`Partial<SetLog>` at the boundary — narrow, documented, and the only
place we lie to the type system.

### UI: celebration modal + PR badges + RPE/notes affordance

- **`PRCelebration`** — full-screen dialog with the warm-editorial
  confetti animation (60 hsl-warm pieces falling 1.6–3 s). Honours
  `prefers-reduced-motion` by skipping the confetti entirely. Headline
  picks from "Single-rep glory." / "Stacked it." / "On fire." based on
  award count. Awards group by exercise, each rendered as a small
  accent chip with the type label and value. Single primary "Nice" CTA
  navigates on close.
- **`PRBadges`** — pill row under the SetRow (between plate viz and
  the RPE affordance). Only renders when the set has `prTypes`; visible
  in both the live and read-only session views.
- **`SetExtras`** — collapsed row by default with summary text
  ("RPE 8 · Notes" if either is set, "RPE · Notes" otherwise). Tap to
  expand. RPE picker is 9 chips (6 → 10, 0.5 step) + a Clear; notes
  is a 2-row textarea that persists on blur. Per-set RPE/notes are
  written immediately to Dexie when the row is already logged, so
  there's no Save action to forget.

### Things deferred

- **Per-set notes search** — no UI yet; notes are visible inside the
  expanded row only. Add to History/Progress later if it proves useful.
- **PR record list view** — `prRecords` table is populated and
  queryable (`[profileId+exerciseId+type]` index) but no Progress-page
  surface yet. Lands with milestone 8 (charts).
- **Confetti tuning per palette** — current hue range (20–80) reads
  warm against both Joshua green and Hayley coral. Revisit if Hayley
  finds it clashes once she lives with it.

---

## 2026-05-06 — Milestone 8: History + progress charts

**Context.** Acceptance was "all charts render with seed of synthetic
test data." Two screens get rebuilt (History, Progress), two new
domain modules (`streak`, `volume`), one synthetic-data utility, one
read-side query layer.

### Synthetic data over a check-in fixture

Charts need *months* of data to look like anything, but we don't want
fixtures committed to the repo. The dev-only "Seed synthetic history"
button in Settings (gated on `import.meta.env.DEV`) wipes the active
profile's session/setLog/PR rows and rebuilds a deterministic 12-week
arc — Mon/Wed/Fri pattern, 4 routine labels rotating, 6 exercises
covering glutes/quads/hamstrings/back/chest, weights ramping
+1.25–2.5 kg/week, RPE jitter from a seeded LCG. Backdates `startedAt`
+ `completedAt` + per-set `completedAt` so the heatmap and trend
charts read correctly.

Scoped to one profile so the partner's data isn't trashed. Replays
through the real `finishSession` so PR detection actually fires —
gives synthetic-day badges + populates `prRecords` for the timeline.

### Streak domain: timezone-aware

Local-day rollover not UTC, per SCOPE §7.8. `localDateKey` projects
each ISO timestamp via `Intl.DateTimeFormat('en-CA', { timeZone })`
to YYYY-MM-DD; the rest is set arithmetic. Current streak counts
backwards from today, but doesn't break until a full local day passes
without a session — i.e. if you trained yesterday and it's now 14:00
today without a session, your streak is still alive. 11 tests in
[src/domain/streak.test.ts](src/domain/streak.test.ts).

### Volume domain + secondary-muscle weighting (closed open question)

Settled the "secondary muscles at what weight?" open question at
**0.5×**. RP / Mike Israetel's MEV/MRV framework and Greg Nuckols'
volume-landmarks work both default to 0.5; reasonable middle ground
between "ignore them entirely (0×)" and "count them fully (1×)".
Exposed as `SECONDARY_MUSCLE_WEIGHT` constant + optional arg on
`volumeByMuscle` so the Settings UI can override later without a
domain rewrite. Drop and failure sets count toward volume; only
warmups are excluded (matches PR detection's working/AMRAP scope plus
"work that happened" for drop/failure). 14 tests.

### Read-side query layer in `src/db/history.ts`

Three hooks:
- `useProfileSessionSummaries` — sessions for a profile (newest first)
  with cached roll-ups: total volume, prCount, set count, sorted set
  logs. The hook does the join + sort once so list rows don't each
  fire a follow-up query.
- `useProfilePRRecords` — PR records, newest first. Used by the
  PR timeline.
- `useExerciseHistory` — all set logs for one exercise, sorted
  ascending. Backbone of the per-exercise drilldown.

Set logs aren't directly indexed by profileId (they're scoped via
their session), so the per-exercise query joins through
`db.sessions.where({ profileId })` first. Acceptable at our data
volume; revisit if a profile crosses ~50k set logs.

### History: 12-week heatmap (closed open question)

Settled at 12 weeks fixed per SCOPE §6.10 — full-year reads tiny on
mobile and 12 weeks matches the typical training cycle. The
`CalendarHeatmap` component renders a 7×N grid (Mon-anchored rows,
oldest column left), shaded by session count with a 4-step intensity
ramp (`bg-surface-soft` → `bg-accent`). Today's cell gets an
accent ring. Cells are tappable buttons (route hookup deferred —
session-by-date isn't a top-level path yet).

Sessions list groups by ISO week (Monday-anchored) with per-week
totals (sessions / PRs / volume). Each row shows date, time, plan
name, duration, total volume, set count, and a star-pill PR count
badge.

### Progress: stat strip + 5 surfaces + range filter

- **Stat strip**: streak (current + best), lifetime sessions,
  lifetime tonnage, lifetime training time. 2×2 grid on mobile, 1×4
  on tablet.
- **Range filter**: 4w / 12w / 6m / All as a pill row at the top;
  applies to PR timeline, drilldown, and both volume charts. Uses
  cutoff in days (28 / 84 / 182 / null).
- **PR timeline**: filtered records, capped at 12 with a "+ N more"
  footer. Tap → session.
- **Per-exercise drilldown**: defaults to the exercise with the most
  working sets; picker swaps. Three Recharts line charts (e1RM, top
  set, volume per session) + a rep-range hit-rate readout (matches
  planned reps from `livePlan` against logged reps for working/AMRAP
  sets).
- **Volume by muscle**: horizontal bar chart, 0.5× secondary
  weighting, distinct hue per muscle.
- **Volume by routine**: stacked weekly bars, one stack per
  `planName` label. Hand-picked palette so colours stay legible
  against both profile accents.

### Tailwind RGB triplets vs Recharts SVG

Theme tokens are stored as RGB triplets (`34 197 94`) so Tailwind
can compose them with alpha via `rgb(var(--accent) / 0.5)`. SVG
attributes ignore CSS parsing and won't accept a bare triplet —
`stroke="var(--accent)"` resolves to `stroke="34 197 94"` and the
line silently disappears. Centralised a `tk(name, alpha?)` helper at
the top of [Progress.tsx](src/screens/Progress.tsx) that wraps with
`rgb(...)`; use it for every Recharts colour prop. Caught in browser
verify when only the dots rendered, no lines.

### Bundle size

Recharts is the heavy dependency. Production build comes in at
~805 kB raw / ~223 kB gzipped — comfortably under SCOPE §8's 300 kB
gzipped budget (relaxed from 250 kB specifically to accommodate
Recharts).

### Things deferred

- **Bodyweight chart** — own milestone (9), needs the bodyweight log
  table populated first.
- **Calendar cell → session navigation** — heatmap cells are
  buttons but currently no-op; a "session-by-date" route lands when
  there's a real use case.
- **Per-exercise drilldown empty states** — picker shows only
  exercises with working sets, so no empty case in normal flow;
  free-session-only profiles will see the "log working sets" hint.
- **Hayley palette tuning for muscle colours** — current hue map is
  hand-picked for the warm-editorial Joshua palette. Some colours
  may want adjusting against the pink Hayley theme. Revisit when
  she's lived with it.

---

## 2026-05-06 — Milestone 9: Bodyweight log

**Context.** Acceptance was "can log weight, view trend, optional
integration with bodyweight exercises". One Dexie schema bump, one
domain helper, two UI components, a Settings toggle, a Body sub-tab
on Progress, and a small wiring change in the session flow.

### One weigh-in per local day (upsert semantics)

`upsertBodyweight` keys on `[profileId+date]`. Re-saving today's
weight overwrites the existing row instead of appending — matches
how a person actually thinks about their weight ("Tuesday's
weigh-in"), avoids cluttering the chart with intra-day noise, and
makes the "Today's weight" card simple: it just looks up
`logs.find(l => l.date === today)` and switches the CTA between Save
and Update.

### Rolling-average overlay needs ≥ 2 points

`rollingAverage` returns `null` for a window that contains only one
sample. Avoids drawing a misleading "smoothed" line that's actually
just the raw weight repeated. Sparse weigh-ins (one per week) won't
get an overlay; daily logging activates it. Trade-off intentional —
a 7-day average over 1 sample is meaningless. 5 tests in
[src/domain/bodyweight.test.ts](src/domain/bodyweight.test.ts).

### Bodyweight-volume integration: log-time write, not derived

The toggle "Count bodyweight in volume" plumbs through SessionScreen
→ BlockCard → ExerciseGroup → SetRow. When ON and the exercise is
bodyweight-only (`measurementType === 'bodyweight_reps' &&
!usesBarbell`) and a weigh-in exists, the SetRow writes
`weight: latestBodyweight` on the SetLog at tick time.

Considered making `setVolume()` smarter (read profile + exercise +
latest bw inside the domain layer), but that fans out the dependency
graph for every volume call site. The log-time approach keeps the
domain layer pure: `setVolume` still does `weight × reps`, the
integration is a one-line concern at the entry point. The cost is
that toggling the setting later doesn't retroactively re-weight old
logs — accepted: the user toggles this once during onboarding, not
mid-history.

PR detection sees the bodyweight-as-weight too. In practice this
doesn't fire false PRs because each log carries the *current* weigh-in,
so subsequent sets at a fluctuating bw don't beat the prior — and the
"weight PR" the first time you log a push-up is genuinely "you did
push-ups at 75 kg for the first time," which is fine.

### Schema: Dexie v3, additive

Added `Profile.useBodyweightForVolume: boolean`. v3 upgrader backfills
existing profiles to `false` so behaviour is unchanged on upgrade.
Seed profiles set the field explicitly. No new indexes — the
bodyweight log table existed since v1.

### Sub-tab vs separate route

SCOPE §6.12 calls Body a sub-tab of Progress. Built it as an in-page
toggle (Charts / Body) below the stat strip rather than a new route
— keeps the lifetime stat strip relevant to both views and shaves
one layer of nav. Future: a `/progress/body` deep link if we want
the URL to remember the choice.

### Things deferred

- **Bodyweight CSV import** — manual entry only. Lands with the
  backup/restore JSON format (milestone 10) which already covers
  `bodyweightLogs`.
- **Per-set bodyweight override** — currently uses
  `latestBodyweight` for every bodyweight set in the session. A
  serious user might want "I weighed myself this morning, use *that*
  for these sets" — defer until requested.
- **Time-based bodyweight exercises** (e.g. plank weighted by bw) —
  out of scope; planks are time only, no rep count to multiply.
- **"Use 7-day avg instead of latest weigh-in"** — could be a tertiary
  toggle if daily weighers prefer a smoothed value; not adding until
  Hayley/I actually weigh daily.

---

## 2026-05-06 — Milestone 10: Backup / restore

**Context.** Acceptance was "wipe IndexedDB → restore → identical
state, PRs recomputed correctly." Three pieces: a versioned JSON
envelope, FS Access auto-write with download fallback, and a tiered
nag system (header banner / Settings modal block / post-session
prompt).

### Versioned envelope, magic string, schemaVersion gate

The JSON file carries:
- `magic: "workout-tracker.backup"` — instant identification at a
  glance and as a parser short-circuit.
- `schemaVersion: 1` — bumps on any breaking change to the data shape;
  the parser refuses files newer than the running app.
- `exportedAt`, optional `appVersion`, optional `profileId`.
- `data: { profiles, exercises, routineTemplates, sessions, setLogs,
  barbells, plateInventory, bodyweightLogs, prRecords }`.

`migrateBackup` is a no-op today; v2 will chain step-by-step
migrations here. 7 tests in
[src/domain/backup-format.test.ts](src/domain/backup-format.test.ts).

### PR recompute on import (SCOPE-mandated)

PR records are **derived state**. The exporter writes them for
diagnostics, but the importer discards them and re-derives from the
imported set logs via `recomputePRsFromSetLogs`. This:
- Walks sessions chronologically (by earliest log's completedAt).
- Sorts each session's logs by `[blockOrder, exerciseOrder, setNumber]`
  before passing to `detectPRs` (same canonical order as
  `finishSession` — see milestone 7).
- Maintains incremental per-exercise baselines so each session sees
  only its prior history, not future logs (subtle but critical: a
  naive "for each session, finishSession()" replay would treat future
  sessions as prior history and silently drop most PRs).
- Patches `profileId` on each new `PRRecord` from the
  session→profile map after the fact, since the recompute helper
  doesn't have profile context.

Verified end-to-end: clean synthetic seed → 146 PRs → export → wipe
→ import → 146 PRs, same set, same values.

### Per-profile vs full-DB exports

`buildBackup({ profileId })` scopes profile-owned rows but always
includes the shared exercise + routine library so the file restores
to a working app. Without `profileId` it dumps everything (used
for "full-database" backups during dev). Filename reflects scope:
`workout-tracker-joshua-2026-05-06.json`.

### Storage I/O: FS Access first, download fallback

[src/lib/backupIo.ts](src/lib/backupIo.ts) handles all browser I/O:
- **`saveBackup`**: tries the persisted FS Access handle silently,
  re-prompts for permission if denied, falls back to download.
- **`chooseAutoBackupFile`**: one-time picker; the handle persists in
  a tiny dedicated IndexedDB (`workout-tracker-meta`, store
  `fs-handles`) so subsequent saves are silent. Kept separate from
  the main app DB so handle blobs never accidentally leak into the
  JSON envelope.
- **`readBackupFile`**: FS Access picker on supported browsers,
  hidden `<input type="file">` everywhere else.

FS Access ships in Chromium-family desktop browsers; Safari /
Firefox / iOS get the download fallback. Detected via
`window.showSaveFilePicker` presence; UI hides the "Set auto-backup
file" button when unavailable.

### Stale-backup nags: three tiers

Per CLAUDE.md "Backup & durability":
- **Header banner** when staleness > 7 days. Subtle on the surface
  cards but unmissable across every screen via `<AppShell>`.
- **Modal block on Settings** when staleness > 30 days. Reuses the
  same `BackupPromptModal` component as the post-session prompt;
  user can dismiss but the visual interruption is intentional.
- **Post-session prompt** when staleness > 7 days, fired right after
  the PR celebration closes (or instead of the celebration when no
  PRs landed). Most natural moment — they're already in "I just did
  a thing" mode.

The shared `staleness(lastBackupAt)` helper gives a tagged severity
(`fresh | stale | urgent`) so component code reads cleanly.

### `Profile.lastBackupAt`

Schema field already existed (since milestone 1). `markBackedUp`
stamps every profile included in the export — per-profile when
scoped, every profile when full-DB. Stamping clears all three nag
tiers immediately.

### Things deferred

- **JSON ZIP / encryption** — backup is plaintext JSON. Fine for a
  personal local-only tool; revisit if ever cloud-syncing.
- **Auto-backup-on-finish** — toggle could fire `saveBackup` from
  the post-session flow without user interaction. Tempting but adds
  a write per workout; defer until the FS Access handle is widely
  in use.
- **Backup-history list** — currently the user knows what they have
  by looking at their downloads folder. A "show me what's been
  backed up" UI would need stored manifest entries.
- **Restore preview** — would be nice to show "this file contains
  X sessions, Y PRs, Z bodyweight entries" before wiping. Today the
  user gets a confirm dialog with the filename only.

---

## 2026-05-06 — Milestone 11: Custom routine builder

**Context.** Acceptance was "can build a 4-week routine from scratch
and run it." One new screen (RoutineEditor), CRUD on db/routines.ts,
fork-from-seed flow, two new routes.

### Working-copy editor, not live-mutating

The editor holds a local `RoutineDraft` in React state and only writes
to Dexie on Save. Cancel discards. This:
- Avoids a "every keystroke is a Dexie write" performance footgun.
- Makes Cancel meaningful — partial work doesn't leak to other tabs
  via `useLiveQuery`.
- Keeps `updatedAt` truthful — bumps once per save, not once per
  keystroke.

The trade-off: navigating away mid-edit silently drops work. Acceptable
for a single-device personal tool; if it ever grates, an autosave-to-
draft approach is a localized change.

### Seeds are read-only; "Edit" forks

CLAUDE.md "Built-in routines are read-only. Editing prompts to fork."
On a seed routine, the detail page shows **Fork & edit** (instead
of **Edit**). Clicking it `confirm()`s, deep-clones the routine via
`forkRoutine`, then routes to `/routines/{newId}/edit`. The fork
keeps `description` but renames to `"<Original> (copy)"` so the user
can tell them apart in the list immediately. The clone uses
`structuredClone(weeks)` so subsequent edits don't bleed back.

The editor itself defends against accidental seed-edit by redirecting
to the detail page if it ever lands on a seed (e.g. via a shared URL).

### Per-block edit affordances

Per-block: type chip (Single / Superset), up/down arrows when there's
somewhere to move, Remove. Per-exercise: tap the name to swap (re-
opens the picker), set count / rep range / rest seconds steppers, or
duration range for time-based exercises. Removing the last exercise
in a block leaves the block (with "No exercises yet.") rather than
auto-deleting it — gives the user a beat to add an alternative
before committing.

### Defaults that match real workouts

- New custom routine starts with one week (Day 1 workout / Day 2
  rest) so the editor isn't a blank canvas.
- Adding a workout day picks the next free letter (A/B/C…) so the
  user doesn't have to think about labels.
- Fresh planned exercise: 3 sets × 8–12 reps × 90s rest (or the
  exercise's `defaultRestSeconds`). Time-based: 3 × 30–60s. These
  match the common hypertrophy default; tweaking them per slot is
  cheap.

### Two routes, one component

- `/routines/new` — `isNew=true` path
- `/routines/:id/edit` — load + edit existing
- Both render `<RoutineEditor>`; param-presence picks the path.
  Cleaner than a single `/routines/edit?id=...` query-param route
  because React Router params reach the component cleanly.

### exactOptionalPropertyTypes friction

Conditional `onMoveUp` / `onMoveDown` props on `<BlockEditor>` can't
be `() => void | undefined` under `exactOptionalPropertyTypes` — TS
demands the property either be present-with-a-fn or omitted. Spread
`{...(condition ? { onMoveUp: ... } : {})}` is the documented
escape hatch. Same trick used a couple of times now (ExercisePicker
in milestone 4, here in milestone 11).

### Things deferred

- **Drag-to-reorder days / blocks** — currently up/down arrows for
  blocks; days are remove-and-re-add. Touch-drag reordering needs a
  proper library (or a careful gesture impl) and isn't worth it for
  a tool with ~10 items per day.
- **Warmups / activations editor** — `DayTemplate.warmups[]` and
  `activations[]` exist on the type but the editor doesn't surface
  them. Strong Curves seed uses them descriptively; revisit if anyone
  edits a routine that needs them.
- **Per-exercise notes** — `PlannedExercise.notes` exists; not yet
  in the editor. Will land alongside the warmups editor.
- **Routine import / share** — JSON copy-paste between profiles or
  users. Backup envelope already covers per-profile export; a
  routine-only export would be a nice ergonomic.

---

## 2026-05-06 — Milestone 12: Polish + deploy

**Context.** Acceptance was "Lighthouse PWA ≥ 95, deployed and
installable." Final pass: error boundary, PWA icons, base-path-aware
Vite config, GitHub Actions deploy workflow.

### Error boundary

[src/components/ErrorBoundary.tsx](src/components/ErrorBoundary.tsx)
wraps the whole app inside `BrowserRouter` so a crash on any screen
falls back to a "We hit a snag" card. Two recovery paths:
- **Try again** clears the boundary state — works for transient
  render bugs (e.g. a stale `useLiveQuery` reading a row that was
  just deleted).
- **Reload app** hard-refreshes — clears Zustand state too.

The fallback explicitly tells the user *"your data is fine — IndexedDB
is intact"* because the obvious fear when a workout app crashes
mid-session is "did I lose my logs?". Console-prints the error +
component stack for bug-report copy/paste; no remote telemetry.

### PWA icons

Hand-rendered the brand barbell mark to PNG via
[scripts/build-icons.py](scripts/build-icons.py) using PIL. Outputs
`pwa-192x192`, `pwa-512x512`, `pwa-maskable-512x512` (with 10%
safe-zone padding so the mark isn't clipped by Android's adaptive
icon mask), and `apple-touch-icon` (180×180 for iOS home screen).
Single source of truth for the mark — re-runnable via
`pnpm icons:build`.

Manifest gets all three PWA icons + the maskable purpose. Apple
needs the separate touch-icon link in `index.html` since iOS
ignores the manifest icon list for the home screen.

### Base path via env var

GitHub Pages serves project sites at `/workout-tracker/`. Hard-coding
that into Vite breaks `pnpm preview` and any future custom domain.
Solution: `BASE_PATH` env var read by `vite.config.ts`. The deploy
workflow sets `BASE_PATH=/workout-tracker/`; locally and in preview
it stays `/`. The PWA manifest's `scope` and `start_url` mirror the
same value so installability works under either base.

Read via `globalThis as { process?: ... }` to avoid pulling in
`@types/node` (we're a frontend project — Node types would also let
through `process.env` in app code, which would be a footgun).

### Deploy workflow

`.github/workflows/deploy.yml`: checkout → pnpm install (frozen
lockfile) → run unit tests → build with `BASE_PATH=/workout-tracker/`
→ upload-pages-artifact → deploy-pages. Uses
`concurrency: { group: pages, cancel-in-progress: true }` so a fast
follow-up commit cancels the in-flight build.

Tests run before the build so a broken commit can't deploy. CI uses
`pnpm test --run` (one-shot, no watch) and the same Node 20 LTS we
use locally.

### Final repo (closed open question)

Settled at **JSHPhysics/workout-tracker**, served at
https://jshphysics.github.io/workout-tracker/. README and
package.json `homepage` + `repository` fields point there.

### Things deferred

- **Manual chunk splitting** — Vite warns about the 800 KB Recharts-
  containing bundle. Could split charts off as a lazy-loaded chunk
  for the Progress screen, but it'd add a flash on tab-in. Worth
  revisiting if the gzipped size ever drifts past the SCOPE 300 KB
  budget.
- **Lighthouse audit run** — config is set up to score well (manifest,
  icons, theme-color, viewport, SW with offline fallback) but I
  haven't run Lighthouse against the deployed URL since the deploy
  hasn't actually run yet. First push to main will tell us.
- **Custom domain** — `BASE_PATH=/` would work straight away if we
  ever point a domain at the GH Pages site.

---

## Open questions (no decision yet)

These are flagged so they don't get lost. Resolve before the milestone in
parentheses.

- ~~Final repo name~~ — settled 2026-05-06; **JSHPhysics/workout-tracker**.
  Lives at https://jshphysics.github.io/workout-tracker/. Vite `base` is
  set via the `BASE_PATH=/workout-tracker/` env var in the GH Actions
  deploy workflow; locally and in `pnpm preview` the base stays `/`.
- ~~Colour palette and primary accent~~ — settled 2026-05-06; see
  "Visual identity" entry above. Profile-as-accent: Joshua green, Hayley
  coral, warm cream surface palette, profile-driven via CSS variables.
- ~~Default plate inventory~~ — settled 2026-05-06; UK home-gym
  (4× 20 / 2× 15 / 4× 10 / 2× 5 / 4× 2.5 / 4× 1.25 kg) plus Olympic
  20 kg + Women's 15 kg bars. See "Milestone 6" entry above.
- ~~Volume-by-muscle weighting for secondary muscles~~ — settled
  2026-05-06; secondary muscles count at **0.5×** the working volume.
  Most strength-coaching literature uses 0.5× as the default (RP / Mike
  Israetel's MEV/MRV framework, Greg Nuckols' volume-landmarks work).
  Configurable in Settings later if it doesn't feel right.
- **Auto-warmup heuristic threshold and on/off default** — SCOPE.md §7.6
  suggests `< 60%` of session top set. Need by milestone 7.
- **Per-exercise barbell override** — currently deferred per SCOPE.md §11;
  flag for revisit once the plate calculator lands and we see whether the
  partner's training (different bar weight) materially differs.
- **Third built-in template (PPL?)** — SCOPE.md §12. Decide before
  milestone 11 (custom routine builder); affects how forking presents.
- ~~Calendar heatmap default range~~ — settled 2026-05-06; **12 weeks
  fixed** per SCOPE §6.10. A full-year heatmap reads tiny on mobile
  and the 12-week window matches the typical training cycle. Drill
  into a session by tapping; longer trends live on the Progress charts.
