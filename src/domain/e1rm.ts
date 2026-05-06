// Estimated 1-rep-max via the Epley formula:
//   e1RM = weight × (1 + reps / 30)
//
// SCOPE.md §7.7 calls e1RM out as one of the four PR types. The numbers
// stop being meaningful past ~10–12 reps, so we cap at 12 — anything
// higher is endurance work, not strength. Returns null for inputs that
// can't yield a useful estimate (zero/negative weight or reps).

const MAX_TRUSTED_REPS = 12;

export function epleyE1RM(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  if (reps > MAX_TRUSTED_REPS) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
