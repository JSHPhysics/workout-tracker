# Handoff — workout-tracker

## Project frame
- Personal PWA, no auth, two profiles (Joshua owner, Hayley primary bug-reporter).
- Deployed: https://jshphysics.github.io/workout-tracker/ — auto on push to main.
- Read `CLAUDE.md` / `SCOPE.md` / `DECISIONS.md` before any non-trivial change.

## Workflow preferences (current)
- **Always commit + push after a change** — don't ask.
- Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Pending one-time setup
- Run on the repo so the in-app "Open as issue" buttons land issues under the right label:
  ```
  gh label create suggestion \
    --description "Auto-filed exercise fix from the app" \
    --color 0E8A16 --repo JSHPhysics/workout-tracker
  ```
- Hayley needs to hit **Settings → Rest timer → Reset rest memory** once on her device. The persist-bug fixed in `d70e664` left drifted per-exercise rest values in her IndexedDB; the code prevents future drift but doesn't migrate existing data.

## Soft secrets / unlock codes
- Dev-mode activation code on the deployed app: **`TANK`** (case-sensitive, in `src/state/devMode.ts`). Unlocks the Developer section (synthetic seed + Exercise review tool) without needing `pnpm dev`.

## Subtle invariants (easy to break unwittingly)
- **Cardio uses `defaultRestSeconds: 0` to mean "no rest timer for this exercise."** The `positive()` filter in `Session.tsx`'s `resolvedRestSeconds` chain deliberately *skips* the exercise level — only filters user-controlled prefs (per-exercise / routine / profile). Preserve or rethink explicitly if touching that chain.
- **"+30s" on the "Rest done" state** arms a 30s timer but does NOT persist it. Intentional. The persist used to happen — that was Hayley's "rest timer ignores my default" bug.
- **`cueFired` ref in `RestTimerBar.tsx`** has two reset paths now: one on `'idle'`/`'paused'`, another keyed on `deadline` to catch `'ended'` → `'running'` re-arming.
- **Warmup-generator target weight propagates to working-set weights only, not reps.** Deliberate.

## Things to know about the GitHub-issue fix queue
- Two entry points: in-workout `SuggestExerciseFixModal` (single exercise) and bulk `/exercises/review` "Open as issue" (multi). Both produce the same JSON shape so `pnpm fix:pull` can read either.
- `pnpm fix:pull` lists open `suggestion`-labelled issues; `--json` mode emits a single combined payload ready to paste into the review tool's import.
- Script requires authenticated `gh` CLI — not installed in the prior session's sandbox.

## Open questions
- Tracked at the bottom of `DECISIONS.md` ("Open questions (no decision yet)"). Notable still-open: auto-warmup heuristic threshold (SCOPE §7.6), third built-in template (PPL? — milestone 11).

## Recent arc (last ~10 commits)
- Bulk audit tooling → in-the-moment Suggest-a-fix → GitHub-issue queue + autopull.
- Today: layered hooray vocal on PR celebration, rest-cue cut-through, rest-timer reliability triple-fix, warmup-target → working-set defaults.
- Wellbeing tracking shipped earlier — domain helpers in place; insights deferred to v2.

## Auto-memory worth carrying forward
- `~/.claude/projects/.../memory/feedback_theme_toggle.md` — general UI scaffolding lesson.
- `~/.claude/projects/.../memory/feedback_tailwind_esm.md` — Vite + Tailwind v3 ESM config gotcha; this project already uses `tailwind.config.cjs` so the lesson is applied but worth knowing for build tweaks.
- Original source path (pre-migration): `C:/Users/Josh/.claude/projects/C--Users-Josh-Documents-Claude-Workspace-Code-workout-tracker/memory/`. After the re-clone, copy these files into the new memory dir Claude creates for the new project path.
