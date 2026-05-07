// Equipment / instructions / diagram metadata layered on top of the
// generated Strong Curves exercise library AND the hand-written
// extras list. Keyed by canonical exerciseId. Anything not in this
// map gets a fallback at seed-load time (no instructions, empty
// requiredEquipment).

import type { EquipmentTag } from '../types';

export interface Enrichment {
  requiredEquipment?: EquipmentTag[];
  instructions?: string[];
  diagram?: string;
  /** Override the auto-generated spotebi slug for this exercise.
   * `null` means "no spotebi page exists, don't generate a link". */
  spotebiSlug?: string | null;
}

export const SPOTEBI_BASE = 'https://spotebi.com/exercise-guide/';
export const SIMPLYFITNESS_BASE = 'https://www.simplyfitness.com/pages/';

/** Convert an exercise name into a best-guess spotebi slug. Drops
 * common equipment prefixes (since spotebi mostly omits them) and
 * normalises punctuation to ASCII hyphens. The result is a *guess* —
 * unverified slugs land users on a 404 if the name doesn't match.
 * Use `spotebiSlug` overrides in the ENRICHMENT map below to fix
 * known mismatches; pass `null` to suppress the link entirely. */
export function spotebiSlugFromName(name: string): string {
  // Drop the leading equipment word so "Barbell Bench Press" → "bench press"
  // matches the spotebi convention of bare names.
  const stripped = name.replace(
    /^(barbell|dumbbell|kettlebell|cable|band(ed)?|machine|kneeling|standing|seated|supine|lying|bodyweight)\s+/i,
    '',
  );
  return stripped
    .toLowerCase()
    .normalize('NFKD') // strip diacritics
    .replace(/[‐-―−]/g, '-') // various unicode dashes → hyphen
    .replace(/[/&]/g, ' ') // slashes, ampersands → space (then to hyphen)
    .replace(/[^a-z0-9\s-]/g, '') // drop anything else
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** ID-prefix → equipment fallback. Applied when no exact-id entry
 * exists in the map below. The Strong Curves seed has ~50 exercises
 * with predictable id stems (`barbell-…`, `dumbbell-…`, `bodyweight-…`,
 * etc.) so we can tag the bulk of the library cheaply. */
export const EQUIPMENT_BY_PREFIX: { match: (id: string, name: string) => boolean; equipment: EquipmentTag[] }[] = [
  { match: (id, n) => /kettlebell/i.test(n) || id.includes('kettlebell'), equipment: ['kettlebell'] },
  { match: (id, n) => /pull[- ]?up|chin[- ]?up/i.test(n) || id.startsWith('pull-up') || id.startsWith('chin-up'), equipment: ['pull-up-bar'] },
  { match: (id, n) => /hip thrust/i.test(n) || id.includes('hip-thrust'), equipment: ['glute-bridge-pad', 'barbell'] },
  { match: (id, n) => /barbell/i.test(n) || id.startsWith('barbell-'), equipment: ['barbell'] },
  { match: (id, n) => /dumbbell/i.test(n) || id.startsWith('dumbbell-'), equipment: ['dumbbells'] },
  { match: (_id, n) => /cable\b/i.test(n), equipment: ['cable-machine'] },
  { match: (_id, n) => /\bband\b|banded/i.test(n), equipment: ['resistance-bands'] },
  { match: (_id, n) => /machine\b|leg press|lat pulldown|seated row/i.test(n), equipment: ['machine'] },
  { match: (_id, n) => /\bbench\b|bench press|incline press|decline press/i.test(n), equipment: ['bench'] },
  { match: (_id, n) => /\bbox\b|step[- ]?up/i.test(n), equipment: ['box'] },
  // Bodyweight catch-all — anything in the Strong Curves seed that
  // matched none of the above is bodyweight. Other libraries should
  // override per-exercise.
];

// Spotebi slug overrides — populated by URL probing 2026-05-07
// (see scripts/probe-spotebi.sh + scripts/probe-candidates.sh).
// `null` suppresses the demo link entirely (no spotebi page exists or
// the closest match was too loose to be useful).
// SimplyFitness fallback slugs — used when no spotebi page exists.
// Slugs are taken directly from simplyfitness.com/pages/workout-exercise-guides
// (no probing needed; the source page lists them). Generally a heavier
// barbell/dumbbell/machine catalogue than spotebi, fills the gaps where
// spotebi was light on compound lifts.
export const SIMPLYFITNESS_OVERRIDES: Record<string, string> = {
  // Routine compounds spotebi was missing
  'pull-up': 'pull-up',
  'chin-up': 'pull-up-with-a-supinated-grip',
  'barbell-overhead-press': 'standing-barbell-shoulder-press',
  'goblet-squat': 'dumbbell-goblet-squat',
  'barbell-close-grip-bench-press': 'close-grip-bench-press',
  // Strong Curves accessories now covered
  'bodyweight-dumbbell-squat': 'bodyweight-squat',
  'bodyweight-dumbbell-step-up': 'dumbbell-step-up',
  'bodyweight-barbell-glute-bridge': 'bodyweight-glute-bridge',
  'bodyweight-dumbbell-single-leg-rdl': 'single-leg-bodyweight-deadlift',
  'modified-inverted-row-bar-t-bar-row': 't-bar-rows',
  'russian-kettlebell-swing': 'kettlebell-swings',
  'front-lat-pulldowns': 'wide-grip-pulldown',
  'one-arm-dumbbell-row-or-band-pull-or-row-with-bar': 'dumbbell-bent-over-row-single-arm',
  'negative-chin-up-underhand-grip-pull-down': 'reverse-grip-pulldown',
};

export const SPOTEBI_OVERRIDES: Record<string, string | null> = {
  // --- Routine compounds: confirmed matches ---
  'barbell-back-squat': 'squat',
  'barbell-bench-press': 'chest-press',
  'barbell-front-squat': 'squat',
  'dumbbell-incline-press': 'chest-press',
  'dumbbell-military-press-standing': 'dumbbell-shoulder-press',
  'dumbbell-row': 'bent-over-row',
  'one-arm-dumbbell-row': 'dumbbell-bent-over-row',
  'seated-row': 'bent-over-row',
  // --- Strong Curves accessories: confirmed matches ---
  'single-leg-glute-bridge': 'single-leg-bridge',
  'side-lying-abduction': 'side-lying-hip-abduction',
  'side-lying-abductions': 'side-lying-hip-abduction',
  'side-lying-clam': 'clamshell',
  'side-plank-on-feet': 'side-plank',
  'straight-leg-sit-up': 'sit-up',
  'knee-pushups': 'knee-push-up',
  'rope-horizontal-chop': 'wood-chop',
  'x-band-walk-or-cable-hip-abductions': 'lateral-band-walk',
  'glute-march': 'march',
  'bodyweight-hip-thrust': 'glute-bridge',
  // --- Stretches: confirmed matches (yoga names) ---
  'stretch-cat-cow': 'cat-pose',
  'stretch-cobra': 'cobra-pose',
  'stretch-lying-cross': 'supine-spinal-twist',
  'stretch-shoulder-backbend': 'bridge-pose',
  'stretch-wrist-biceps': 'wrist-stretch',
  'stretch-figure-four': 'glute-stretch',
  'stretch-one-leg-pike': 'head-to-knee',
  'stretch-rear-hand-clasp': 'cow-face-pose',
  'stretch-standing-backbend': 'crescent',
  // --- No spotebi page, suppress the broken link ---
  '25-lb-back-extension-reverse-hype': null,
  '25-lb-back-extension-reverse-hyper': null,
  'band-anti-rotation-hold': null,
  'barbell-close-grip-bench-press': null,
  'barbell-dumbbell-bench-press': null,
  'barbell-overhead-press': null,
  'barbell-power-clean': null,
  'body-weight-negative-pushup': null,
  'bodyweight-barbell-box-squat': null,
  'bodyweight-barbell-glute-bridge': null,
  'bodyweight-dumbbell-single-leg-rdl': null,
  'bodyweight-dumbbell-squat': null,
  'bodyweight-dumbbell-step-up': null,
  'bodyweight-hip-hinge-with-dowel': null,
  'bodyweight-or-45-lb-back-extension': null,
  'bodyweight-step-up-reverse-lunge-combo': null,
  'bodyweight-swiss-ball-45-degree-back-extension': null,
  'chin-up': null,
  'elevated-foot-rkc-plank': null,
  'foam-roll-lats': null,
  'foam-roll-quads': null,
  'front-lat-pulldowns': null,
  'goblet-squat': null,
  'modified-inverted-row-bar-t-bar-row': null,
  'negative-chin-up-underhand-grip-pull-down': null,
  'one-arm-dumbbell-row-or-band-pull-or-row-with-bar': null,
  'pull-up': null,
  'rkc-plank': null,
  'russian-kettlebell-swing': null,
  'standing-single-arm-cable-row': null,
  'stretch-90-90': null,
  'stretch-pancake': null,
  'stretch-tspine-rotation': null,
  'swiss-ball-crunch': null,
  'swiss-ball-side-crunch': null,
  'torso-elevated-push-up': null,
  'towel-row': null,
};

export const ENRICHMENT: Record<string, Enrichment> = {
  // --- Big compounds with full enrichment -----------------------------------
  'barbell-back-squat': {
    requiredEquipment: ['barbell'],
    diagram: 'squat',
    instructions: [
      'Set the bar on your upper back, just below the rear delts.',
      'Brace, unrack, take two steps back, feet shoulder-width.',
      'Sit down between your hips, knees tracking over toes.',
      'Descend until hip crease passes the knee, then drive up.',
    ],
  },
  'barbell-front-squat': {
    requiredEquipment: ['barbell'],
    diagram: 'squat',
    instructions: [
      'Rack the bar across the front delts with elbows high.',
      'Keep elbows up and torso upright through the descent.',
      'Drive evenly through the whole foot to stand.',
    ],
  },
  'barbell-deadlift': {
    requiredEquipment: ['barbell'],
    diagram: 'deadlift',
    instructions: [
      'Bar over mid-foot, shins ~1 inch from the bar.',
      'Hinge to the bar, grip outside the knees, take the slack out.',
      'Push the floor away — chest leads, hips and shoulders rise together.',
      'Lock out by squeezing glutes; lower with control.',
    ],
  },
  'barbell-romanian-deadlift': {
    requiredEquipment: ['barbell'],
    diagram: 'deadlift',
    instructions: [
      'Stand tall holding the bar at hip height, slight knee bend.',
      'Push hips back, bar slides down the thighs, shins stay vertical.',
      'Stop when you feel a strong hamstring stretch; do not round.',
      'Drive hips forward to stand. Keep the bar close throughout.',
    ],
  },
  'barbell-hip-thrust': {
    requiredEquipment: ['barbell', 'glute-bridge-pad', 'bench'],
    diagram: 'hip-thrust',
    instructions: [
      'Sit on the floor with shoulder blades against a bench.',
      'Roll the bar (with pad) over your hips. Feet flat, shins vertical at the top.',
      'Drive through your heels, squeeze the glutes hard at lockout.',
      'Lower under control, no bouncing the bar.',
    ],
  },
  'barbell-glute-bridge': {
    requiredEquipment: ['barbell', 'glute-bridge-pad'],
    diagram: 'hip-thrust',
    instructions: [
      'Lie flat, knees bent, feet flat on the floor.',
      'Bar across hips with a pad. Hands lightly on the bar.',
      'Drive hips up until torso aligns with thighs.',
      'Pause and squeeze; lower with control.',
    ],
  },
  'barbell-bench-press': {
    requiredEquipment: ['barbell', 'bench'],
    diagram: 'bench-press',
    instructions: [
      'Lie back, eyes under the bar, slight arch, feet planted.',
      'Grip ~1.5x shoulder width. Unrack and stack the bar over shoulders.',
      'Lower to mid-chest with elbows ~70°, touch and press.',
      'Lock out, breathe at the top.',
    ],
  },
  'barbell-overhead-press': {
    requiredEquipment: ['barbell'],
    diagram: 'overhead-press',
    instructions: [
      'Bar racked at the front delts, elbows just in front of the bar.',
      'Brace hard, glutes tight, dip your head as the bar passes.',
      'Press in a straight line, finishing with biceps by the ears.',
    ],
  },
  'barbell-bent-over-row': {
    requiredEquipment: ['barbell'],
    diagram: 'row',
    instructions: [
      'Hinge to ~45°, neutral spine, bar hanging from shoulders.',
      'Pull the bar to the lower ribs, leading with the elbows.',
      'Squeeze the back briefly; lower under control.',
    ],
  },
  'pull-up': {
    requiredEquipment: ['pull-up-bar'],
    diagram: 'pull-up',
    instructions: [
      'Hang from the bar with a slightly wider than shoulder grip.',
      'Pull your chest toward the bar; chin must clear the bar.',
      'Lower under control, full extension at the bottom.',
    ],
  },
  'chin-up': {
    requiredEquipment: ['pull-up-bar'],
    diagram: 'pull-up',
    instructions: [
      'Hang from the bar with palms facing you, hands shoulder width.',
      'Pull your chest toward the bar, squeezing the lats and biceps.',
      'Lower fully — no kipping.',
    ],
  },
  'push-up': {
    requiredEquipment: ['bodyweight'],
    diagram: 'push-up',
    instructions: [
      'Hands under shoulders, body in one straight line head-to-heels.',
      'Lower until chest is just off the floor.',
      'Press up explosively, lock out the elbows briefly.',
    ],
  },
  'bodyweight-walking-lunge': {
    requiredEquipment: ['bodyweight'],
    diagram: 'lunge',
    instructions: [
      'Step forward into a long stride; back knee just above the floor.',
      'Front shin vertical, torso upright.',
      'Push through the front heel to step into the next rep.',
    ],
  },
  'plank': {
    requiredEquipment: ['bodyweight', 'yoga-mat'],
    diagram: 'plank',
    instructions: [
      'Forearms on the floor, elbows under shoulders, body straight.',
      'Squeeze glutes and brace the abs — no sagging hips, no peaked.',
      'Breathe shallow but steady; hold for the prescribed time.',
    ],
  },
};
