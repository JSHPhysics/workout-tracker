// Exercise consolidation map. The Strong Curves spreadsheet ships
// some entries with weight prefixes baked into the name ("25 lb Back
// Extension /Reverse Hyper") and a few near-duplicates (singular /
// plural; typos; verbose alt-name variants). This module:
//
//  - aliases redundant ids onto a clean canonical id
//  - defines the canonical exercise records that don't exist in the
//    auto-generated seed (e.g. the new "Back Extension / Reverse
//    Hyper" that absorbs three legacy variants)
//  - exposes `resolveExerciseId()` used by the seed-loader (when
//    rewriting routine references) and the boot migration in
//    `src/db/sessions.ts` (when rewriting user-data references).
//
// `strongCurves.ts` is NOT edited directly — it's generated from the
// source xlsx via `pnpm seed:build`, and any manual edits would be
// lost on the next regenerate. All cleanup happens in this single
// overlay map.

import type { EquipmentTag, Exercise } from '../types';

/** Old id → canonical id. Every value here must be either an id
 * already present in the seed (strongCurves / exercisesExtra) OR
 * defined in `ALIASED_CANONICAL_NEW` below. */
export const EXERCISE_ALIASES: Readonly<Record<string, string>> = {
  // --- Back-extension family ----------------------------------------
  // Three near-duplicates merged into one cleanly-named canonical:
  //   - "25 lb Back Extension /Reverse Hype"  (typo of "Hyper")
  //   - "25 lb Back Extension /Reverse Hyper" (weight prefix)
  //   - "Bodyweight or 45 lb Back Extension"  (weight prefix)
  // All three trained the same hip-hinge pattern at different load
  // points across Bret's program phases. The 25/45 lb suggestions
  // were progression-phase notes, not part of the exercise identity.
  '25-lb-back-extension-reverse-hype': 'back-extension-reverse-hyper',
  '25-lb-back-extension-reverse-hyper': 'back-extension-reverse-hyper',
  'bodyweight-or-45-lb-back-extension': 'back-extension-reverse-hyper',

  // --- Row family --------------------------------------------------
  // Verbose "or X or Y" variant from the bodyweight version of Strong
  // Curves — same pulling motion as the canonical one-arm dumbbell
  // row; the band / broom-bar alternatives were just equipment notes.
  'one-arm-dumbbell-row-or-band-pull-or-row-with-bar': 'one-arm-dumbbell-row',

  // --- Plural / singular ------------------------------------------
  // Routines reference the plural "abductions" but the singular form
  // reads better — canonicalise to the singular and walk references.
  'side-lying-abductions': 'side-lying-abduction',
};

/** Canonical exercise records for ids that don't already exist in
 * `STRONG_CURVES_EXERCISES` or the hand-written extras. Added by the
 * seed-loader after its merge pass. Currently only the back-extension
 * canonical needs a brand-new entry — the row + side-lying canonicals
 * already exist under their cleaner ids. */
// Match the local ExerciseSeed shape in `db/seed-loader.ts` exactly —
// `Exercise['instructions']` resolves to `string[] | undefined` which
// is rejected as a value for an optional `string[]?` field under
// `exactOptionalPropertyTypes`. Spelling out the bare types avoids
// the friction.
type ExerciseSeed = Omit<
  Exercise,
  | 'isCustom'
  | 'profileId'
  | 'requiredEquipment'
  | 'instructions'
  | 'diagram'
  | 'demoUrl'
> & {
  requiredEquipment?: EquipmentTag[];
  instructions?: string[];
  diagram?: string;
  demoUrl?: string;
};

export const ALIASED_CANONICAL_NEW: readonly ExerciseSeed[] = [
  {
    id: 'back-extension-reverse-hyper',
    name: 'Back Extension / Reverse Hyper',
    category: 'hip-hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    secondaryMuscles: ['back', 'core'],
    measurementType: 'weight_reps',
    defaultRestSeconds: 90,
    perSide: false,
    usesBarbell: false,
    requiredEquipment: ['bench'],
    instructions: [
      'Lie face-down on a 45° back-extension bench (or reverse-hyper) with hips at the pad edge.',
      'Cross arms over chest or hold a plate against the chest for added load.',
      'Hinge at the hips, lowering the torso under control until you feel a hamstring stretch.',
      'Squeeze the glutes to raise the torso back to a straight line — do not hyperextend.',
    ],
  },
];

/** Replace an aliased id with its canonical, or return the input
 * unchanged. Used by the seed-loader's routine walk and the boot-
 * time data migration. */
export function resolveExerciseId(id: string): string {
  return EXERCISE_ALIASES[id] ?? id;
}
