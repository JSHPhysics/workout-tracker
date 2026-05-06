# Workout Tracker — Scope & Architecture

**Owner:** Joshua Stafford-Haworth (JSHPhysics)
**Status:** Pre-build spec. Hand-off to Claude Code.
**Working repo name:** `workout-tracker` *(rename freely)*
**Last updated:** 2026-05-06

---

## 1. Overview

A personal-use, web-based workout tracker. Users select from built-in routine templates (Strong Curves *Bootyful Beginnings* + *Bodyweight* ship as the first two), build their own from scratch, or run free-form sessions with no template at all.

**Two profiles** (you + partner) selected via an on-device picker. **No auth, no cloud, no backend.** Data lives in IndexedDB; durability is delivered via user-controlled JSON export/import with persistent stale-backup nagging.

Static SPA, deployable to GitHub Pages, installable as a PWA.

---

## 2. Goals & non-goals

### Goals
- Run any routine (built-in or custom) with minimal friction
- Edit exercises / sets / reps mid-session without ceremony
- Live rest, exercise countdown, and interval timers (audio + vibration)
- **Plate calculator with per-profile barbell + plate inventory**
- **Automatic PR detection** (weight, reps, e1RM, single-session volume)
- **Set typing** (warmup / working / drop / failure / AMRAP)
- **RPE and per-set notes** logged inline during the workout
- **Bodyweight tracking** with chart, integrated with bodyweight exercises
- **Muscle group tagging** with volume-by-muscle-group charts
- Date-stamped session history, streak counter, lifetime tonnage
- Survive device wipes via user-owned JSON backups
- Two-profile isolation
- Fully offline-capable; no network at runtime
- Strong Curves programmes as built-in templates

### Non-goals (v1)
- Authentication, accounts, cloud sync, multi-device sync
- Excel template importer *(deferred — see §11)*
- Social / sharing / leaderboards
- Native wrapping (Capacitor / Kotlin), iOS-specific work
- Photo / video exercise demos
- Health-platform integration (Apple Health / Google Fit / wearables)
- Cardio metrics (heart rate, distance)
- Auto-progression engine
- Mood / energy / sleep tracking
- Body measurements / progress photos

---

## 3. Platform & stack

| Concern | Choice | Reason |
|---|---|---|
| Build tool | **Vite 5** | Fast, static output |
| UI framework | **React 18 + TypeScript (strict)** | Familiar from Revision Tracker |
| Styling | **Tailwind CSS** | Consistent with Revision Tracker |
| Local DB | **Dexie.js** | Typed, observable IndexedDB with migrations |
| UI state | **Zustand** | Timers, current set entry only |
| Charts | **Recharts** | React-native, easy theming |
| Routing | **React Router** | Standard |
| PWA | **vite-plugin-pwa** (Workbox) | Installable, offline cache |
| Package mgr | **pnpm** | Consistent with Revision Tracker |
| Hosting | **GitHub Pages** | Same workflow as `jshphysics.github.io` |

No backend, no API, no auth library, no analytics, no third-party runtime calls.

---

## 4. Data architecture

### 4.1 Storage layers

1. **Primary:** IndexedDB (Dexie). One database, per-profile namespacing.
2. **Ephemeral UI state:** Zustand. Never persisted.
3. **Durable backup:** JSON file owned by user.
   - Manual export/import in Settings.
   - Auto-export via File System Access API (desktop Chrome/Edge): user grants persistent permission to a folder once (e.g. their Drive desktop sync folder), app writes silently after each completed session.
   - Fallback (mobile / Safari / Firefox): triggered file download with stale-backup nag UX.

### 4.2 Why this is durable

IndexedDB **can** be cleared. The durability guarantee comes from the JSON file. Nag UX:
- Header banner if last backup > 7 days
- Modal block on entering Settings if > 30 days
- Post-session prompt: *"Back up now?"*
- Settings shows DB size estimate and last-backup metadata

### 4.3 Entities (TypeScript-shaped)

```
Profile
  id, name, color, unitSystem ('kg' | 'lb'),
  activeRoutineId | null, lastBackupAt | null, createdAt

Exercise
  id, name,
  category ('glute' | 'quad' | 'hip-hinge' | 'push' | 'pull' | 'core' |
            'accessory' | 'warmup' | 'activation' | 'cardio' | 'other'),
  primaryMuscles: MuscleGroup[],          // e.g. ['glutes', 'hamstrings']
  secondaryMuscles: MuscleGroup[],
  measurementType ('weight_reps' | 'bodyweight_reps' |
                   'time_seconds' | 'distance' | 'reps_each_side'),
  defaultRestSeconds, perSide (boolean),
  usesBarbell (boolean),                   // drives plate calculator visibility
  isCustom, profileId | null

MuscleGroup
  enum: 'glutes' | 'quads' | 'hamstrings' | 'calves' | 'chest' | 'back' |
        'shoulders' | 'biceps' | 'triceps' | 'core' | 'forearms' |
        'adductors' | 'abductors' | 'traps' | 'lats'

RoutineTemplate
  id, name, description,
  weeks: WeekTemplate[],
  isSeed, profileId | null,
  createdAt, updatedAt

WeekTemplate / DayTemplate / Block / PlannedExercise
  // as previously specced — see §6 for behaviour

Session
  id, profileId, templateRef? { routineId, weekNumber, dayNumber },
  startedAt (UTC ISO),                     // auto on Start
  completedAt (UTC ISO) | null,            // set on Finish
  planName, notes,
  prCount (cached, count of new PRs achieved this session)

SetLog
  id, sessionId, exerciseId,
  blockOrder, exerciseOrder, setNumber,
  setType ('working' | 'warmup' | 'drop' | 'failure' | 'amrap'),  // default 'working'
  weight?, barWeight?, reps?, durationSeconds?,
  rpe?,                                     // 1–10 scale, optional
  notes?,                                   // per-set free-text
  side ('left' | 'right' | null),
  prTypes: PRType[],                        // [] if none — see §7.7
  completedAt (UTC ISO)

PRType
  enum: 'weight' | 'reps_at_weight' | 'e1rm' | 'session_volume'

Barbell (per profile)
  id, profileId, name, weight, isDefault    // e.g. "Olympic 20 kg", "Women's 15 kg"

PlateInventory (per profile)
  id, profileId,
  plates: { weight: number, count: number, color?: string }[]

BodyweightLog
  id, profileId, weight, date (YYYY-MM-DD), notes?

PRRecord                                    // denormalised for fast PR-timeline queries
  id, profileId, exerciseId, type: PRType,
  value, achievedAt, sessionId, setLogId
```

### 4.4 Schema migrations

Dexie's `version().stores()` chain. Migrations are **additive**; never edit a past version. Each migration documented in `DECISIONS.md`.

### 4.5 Backup file format

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-06T18:00:00Z",
  "profile":         { ...Profile },
  "exercises":       [...customExercisesOnly],
  "routines":        [...customRoutinesOnly],
  "sessions":        [...allSessionsForProfile],
  "setLogs":         [...allSetLogsForSessions],
  "barbells":        [...allBarbellsForProfile],
  "plateInventory":  { ...PlateInventory },
  "bodyweightLogs":  [...allBodyweightLogsForProfile],
  "prRecords":       [...allPRsForProfile]
}
```

Built-in/seeded data is **not** included (deterministic from code seed). On import: replace-or-merge dialogue; merge uses `id` with last-write-wins. PRs are recomputed from set logs after import to guarantee consistency.

---

## 5. Built-in routine templates

Two seeded routines ship in v1, both `isSeed: true` and read-only:
1. **Strong Curves — Bootyful Beginnings** (Weeks 1–8)
2. **Strong Curves — Bodyweight** (Weeks 1–4)

**Source of truth:** the `.xlsx`. Build step: `scripts/build-seed.py` reads the spreadsheet and emits `src/seed/strongCurves.ts` as a typed constant. The exercise library is seeded with all unique exercises (~50) plus default rest timers, **primary/secondary muscle group tags**, and `usesBarbell` flags.

Seeded routines are immutable. Editing prompts to fork into a custom copy.

---

## 6. UX & screens

### 6.1 Navigation tree

```
[ Profile picker ]
   └─→ [ Today ]
         ├─ [ Workout session ]   (focal screen)
         ├─ [ Routines ]   →  [ Routine detail / editor ]
         ├─ [ Exercises ]  →  [ Exercise editor ]
         ├─ [ History ]    →  [ Session detail ]
         ├─ [ Progress ]   (charts & PRs)
         ├─ [ Body ]       (bodyweight log)
         └─ [ Settings ]   (incl. plate calculator config)
```

Bottom tab bar: **Today | History | Progress | Routines | Settings**. Body sits inside Progress as a sub-tab. Profile name + colour swatch top-left at all times; tap to switch.

### 6.2 Today

- **Stat strip** at top: current streak, this-week sessions, last session date.
- **Continue active routine** card (if `activeRoutineId` set) — suggests first uncompleted day.
- **Pick a routine** — opens routine list.
- **Free session** — empty session.
- **Recent sessions** glance (last 3, tappable).
- **Backup-stale banner** if applicable.

### 6.3 Workout session (focal screen)

Single scrollable page:
1. **Warmup checklist** — collapsed by default, tap-to-tick.
2. **Activation checklist** — same pattern.
3. **Main blocks** — one card per block:
   - **Single block:** exercise name, target sets × reps, set rows.
   - **Superset (A1/A2, B1/B2):** twin columns; set ticks alternate.
   - **Set row:** [set type chip] · weight stepper · reps stepper · tick. Time-based exercises swap reps for countdown.
   - **Plate visualisation** under the weight stepper for barbell exercises (see §6.4).
   - **Last session inline:** prior weight × reps as ghost text — tap to copy.
   - **Set-row long-press:** RPE input, notes, change set type, mark drop/failure.
   - **Rep-range outcome:** after tick, set row gets a subtle indicator — green if reps ≥ target max, amber if within range, red if below target min.
   - **Add set / remove set** affordance per exercise.
   - **Long-press exercise card:** swap, change sets/reps, add notes, mark skipped.
4. **Add exercise mid-workout:** floating action button.
5. **Finish workout:** sticky bottom button. Sets `completedAt`. **PR celebration** modal if any new PRs were hit (confetti + list). Then routes to Today with backup prompt if stale.

**Top bar:** elapsed time, current routine + week/day label (or "Free session"), finish button.
**Sticky bottom rest-timer bar** when active.

### 6.4 Plate calculator

Two surfaces:

**(a) Inline on the set row** (barbell exercises only): renders a compact horizontal plate visualisation showing what to load on each side to hit the entered weight. Updates live as the user changes the weight. Greys out if the inventory can't make the weight, with the closest achievable weight suggested below.

**(b) Settings → Equipment:**
- Barbell list: add/edit/delete with weight + name. Mark one as default.
- Plate inventory: per-weight count editor. Defaults seeded as a sensible UK home-gym set (1.25 / 2.5 / 5 / 10 / 15 / 20 kg pairs) — user adjusts.
- "Test it" widget: type a target weight, see the load-out, see the closest achievable.

Calculation: greedy from heaviest to lightest, per side, doubled. Bar weight defaults to the profile's default barbell unless overridden per exercise (in v1 we only allow per-profile default; per-exercise override deferred).

### 6.5 Inputs & timers

- **Weight stepper:** custom +/− stepping by 2.5 kg (configurable), long-press to scrub, tap centre to type.
- **Reps stepper:** +/− 1, tap to type.
- **Time stepper:** preset chips (15/30/45/60/90/120 s) + type-to-set.
- **RPE input:** 1–10 chips, optional, available via long-press.

Native number inputs are not used.

### 6.6 Rest timer

- Auto-starts on set tick using planned `restSeconds` (or profile global default).
- Sticky bar at bottom: visual ring + numeric remaining + skip / +30 s / pause.
- At 0: short vibration burst + audio cue (configurable).
- Survives screen lock via Wake Lock API; recalculates on Page Visibility resume.

### 6.7 Interval timer (lightweight)

Accessible from anywhere via a **Timers** entry in the navigation drawer. Three modes:
- **Stopwatch** — count up.
- **Countdown** — count down with cue.
- **Interval** — work/rest pairs, configurable rounds (covers EMOM and Tabata).

Not tightly integrated into routine plans in v1 — it's a utility surface for circuits and HIIT layered on top.

### 6.8 Routines list & editor

Two sections: **Built-in templates** (badged) and **My routines**. Per item: Start | View / edit | Set as active | Duplicate | Delete (custom only). FAB: New routine.

Editor: Tree (Routine → Weeks → Days → Blocks → Exercises). Drag-reorder, duplicate week, copy-day, fork the seed. Block toggle: single ↔ superset. Day toggle: workout ↔ rest.

### 6.9 Exercise editor

Library list with category filter, muscle-group filter, and search. Per exercise: name, category, **primary/secondary muscles**, measurement type, per-side flag, **uses barbell**, default rest, notes. Custom exercises badged.

### 6.10 History

- List grouped by week → day, newest first. Each row: date, routine label, duration, total volume, **PR badges** (if any).
- **Calendar heatmap** header (last 12 weeks), shaded by session count; tap a date to jump to that session.
- Tap a session → full detail: every set logged with type chips, RPE if recorded, notes, total volume, duration, PRs hit.
- Edit-historical: allowed but logged. Original `startedAt`/`completedAt` immutable.

### 6.11 Progress (charts & PRs)

**Header strip:** current streak, longest streak, total sessions, total tonnage (lifetime), training time (lifetime).

**Sections:**
- **PR timeline** — chronological list of all PRs across exercises, badge-coloured by type. Tap to jump to the session.
- **Per-exercise drill-down** — pick an exercise:
  - Estimated 1RM trend (Epley)
  - Top-set weight × reps over time
  - Total volume per session
  - Rep-range hit-rate over time (% of working sets hitting the target range)
- **Volume by muscle group** — stacked area or bar chart, last 4w / 12w / all. Aggregates SetLogs via the exercise's primary-muscles tagging (configurable: include secondary at 50% weight).
- **Volume by routine label** — A / B / C / Free over weeks.
- **Bodyweight chart** — line chart with optional rolling 7-day average overlay.

Time range filter at the top of the screen applies to all charts: 4w / 12w / 6m / All.

### 6.12 Body (sub-tab of Progress)

Minimal log: a list of bodyweight entries (date + weight + optional note), an "Add today's weight" CTA, and the chart from §6.11. Bodyweight exercises in the workout session can optionally pull the most recent bodyweight entry for accurate volume calculations (toggle in Settings).

### 6.13 Settings

- Profile name, colour, units (kg/lb)
- Active routine selector
- Rest timer global default + audio/vibration toggles
- **Equipment** — barbell list, plate inventory (see §6.4)
- **Backup section** — export, import, FSAccessAPI folder pick, last-backup info, automatic backup toggle
- Storage usage estimate
- Reset profile (double-confirm + forced backup)
- Manage profiles

---

## 7. Behavioural details

### 7.1 Customisation rules
- Seeded routines are immutable. Editing prompts to fork.
- Mid-session edits affect only that session unless user explicitly chooses *"also save to template"* (custom routines only).
- Custom exercises and routines are profile-scoped; the partner won't see them.

### 7.2 Routine progression — user-driven
No auto-advancing cursor. Today's "Continue active routine" suggestion is a heuristic over session history: the first week/day with no completed `Session.templateRef` matching it. User can start any session from any routine via Routines → pick → Start, or use the **Jump to…** picker on Today.

### 7.3 Supersets
A1/A2, B1/B2 modelled as `Block { type: 'superset' }`. Session UI alternates set ticks. Rest between sides uses the **shorter** of the two configured rests.

### 7.4 Time-based exercises
`measurementType: 'time_seconds'` replaces reps stepper with countdown that locks the input on start and ticks the set on completion (or skip).

### 7.5 Per-side exercises
`perSide: true` shows L/R toggles; both must be ticked to count the set complete. Logged as separate `SetLog` rows with `side`.

### 7.6 Set types
- **working** (default) — counted in volume, eligible for PRs
- **warmup** — excluded from volume aggregates and PR detection
- **drop** — counted in volume; flagged separately in session detail
- **failure** — counted in volume; flagged
- **amrap** — counted; reps treated as the rep PR comparison key

UI: a small chip on the set row, tappable to change. Default is **working**; the first 1–2 sets of barbell compounds can be auto-suggested as warmup based on weight ratio (heuristic: < 60% of session top set), but defaults user-overrideable.

### 7.7 PR detection
Computed on session completion (and on set log edit). PR types:

| Type | Definition |
|---|---|
| `weight` | Heaviest weight ever lifted for this exercise (any reps ≥ 1, working/AMRAP only) |
| `reps_at_weight` | Most reps ever performed at this exact weight (working/AMRAP only) |
| `e1rm` | New high on Epley estimate (`weight × (1 + reps/30)`), working/AMRAP only |
| `session_volume` | Most volume in a single session for this exercise |

Each is independent — a single set can hit multiple types. PRs are stored as `PRRecord` rows for fast queries. UI: badge on set rows in history, in-session celebration modal, dedicated PR timeline in Progress.

Imported sessions trigger a recompute of all PRs for the affected exercises.

### 7.8 Streak
Current streak = consecutive days with at least one completed session. Resets at the user's local midnight (timezone-aware). Longest streak is tracked. Surfaced on Today and Progress.

### 7.9 Free sessions
`templateRef` is null. Behaves identically to templated sessions otherwise. Appear in History (labelled "Free") and in Progress charts.

### 7.10 Dates and timezones
Timestamps stored UTC ISO 8601; displayed local. Bodyweight log dates and streak calculations use the user's local date.

---

## 8. Non-functional requirements

- **Offline-first.** Service worker caches the full app shell + seed. Zero network at runtime.
- **No analytics.**
- **Performance budget:** TTI < 1 s on a mid-range Android over LAN. JS bundle < 300 kB gzipped (relaxed from earlier 250 kB given Recharts).
- **Accessibility:** WCAG AA contrast, keyboard navigable, ≥ 48 px tap targets, screen-reader labels on icon buttons.
- **Code quality:** TypeScript strict, ESLint, Prettier. Domain types in `src/types/`. Exhaustive switches via `assertNever`.
- **No native number inputs** for weight/reps.

---

## 9. Visual & interaction design

- Minimum cognitive load: one primary action per screen.
- Dark mode default; light mode follows `prefers-color-scheme`.
- High-contrast option for gym lighting.
- Big touch targets — gym hands, sweat, fingerless gloves.
- Inline editing > modal flows.
- Optimistic writes — never block on save.
- Subtle haptics on set tick.

---

## 10. Build milestones (for Claude Code)

| # | Milestone | Acceptance |
|---|---|---|
| 1 | **Scaffold** — Vite + React + TS + Tailwind + Dexie + PWA | App boots, profile picker, theme works |
| 2 | **Data model + seed** — schemas, Strong Curves importer script, exercise library with muscle tags | Both built-in routines loaded; can browse read-only |
| 3 | **Workout session core** — load planned workout, set rows, save SetLogs with dates and set types | Can complete a Workout A end-to-end and see it dated in History |
| 4 | **Free session + mid-workout editing** — empty session flow, on-the-fly add/swap/skip | Can deviate from any plan and have logs reflect reality |
| 5 | **Rest timer + interval timer** — sticky rest bar, audio/vibration, wake lock; standalone interval timer | Timer auto-starts on set tick and survives screen lock; EMOM/Tabata works |
| 6 | **Plate calculator + equipment settings** — barbell list, plate inventory, inline plate viz on set rows | Setting target weight shows correct plate load-out; closest-achievable suggestion works |
| 7 | **PR detection + RPE + per-set notes** | New PRs show celebration modal; PR badges appear in history; RPE/notes persist |
| 8 | **History + progress charts** — list, calendar heatmap, per-exercise drilldown, volume-by-muscle, streak, lifetime tonnage, PR timeline | All charts render with seed of synthetic test data |
| 9 | **Bodyweight log** — entries, chart, integration toggle | Can log weight, view trend, optional integration with bodyweight exercises |
| 10 | **Backup / restore** — JSON export, FSAccessAPI auto-write, import, stale warning, PR recompute on import | Wipe IndexedDB → restore → identical state, PRs recomputed correctly |
| 11 | **Custom routine builder** — full CRUD on routines/weeks/days/blocks | Can build a 4-week routine from scratch and run it |
| 12 | **Polish & deploy** — empty states, error boundaries, loading states, GitHub Pages action | Lighthouse PWA ≥ 95, deployed and installable |

---

## 11. Deferred (v2+)

- **Excel template importer** — define a column convention compatible with the source spreadsheet shape; leave a stub interface in v1.
- **Cloud sync option** — schema is Postgres-compatible; Supabase plug-in possible without migration.
- **Capacitor Android wrap** — for app-icon launching, richer notifications, native plate-haptic feedback.
- **Auto-progression engine** — programme-aware suggestions ("you hit all reps last time, add 2.5 kg today").
- **Photo / video exercise demos** — content sourcing + storage.
- **Health platform integration** — Apple Health, Google Fit, Wear OS, Apple Watch.
- **Cardio metrics** — heart rate, distance, pace.
- **Body measurements & progress photos.**
- **Mood / energy / sleep** pre-workout check-in.
- **Per-exercise barbell override** (e.g. EZ bar for curls, default bar for squats).
- **Pet / gamification layer** (cf. Revision Tracker vision).
- **Programme-aware deload weeks.**

---

## 12. Open questions

*Resolve in `DECISIONS.md` as they arise. None are blockers for milestone 1.*

- Final app and repo name (working: `workout-tracker`).
- Default colour palette and primary accent.
- Whether to ship a third built-in template (e.g. PPL) for variety.
- Default plate inventory — UK home-gym standard or something more conservative.
- Volume-by-muscle weighting — does secondary count at 50%, 33%, or 0%?
- Calendar heatmap default range — 12 weeks vs full year.
- Set-type warmup auto-detection threshold — leave on or off by default?
