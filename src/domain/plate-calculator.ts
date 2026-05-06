// Pure plate-loadout solver. No React, no Dexie — fully unit-tested.
//
// Approach: enumerate every per-side total reachable from the available
// pairs (subset-sum on a small alphabet — typical home-gym inventories
// have < 1000 reachable totals so this is essentially free), then pick
// the total closest to the target. Picking the closest reachable total
// rather than greedy-down means swap-style upgrades like
// `[1.25, 1.25]` → `[2.5]` come out naturally because we discover the
// composition with the heavier plate first when slots are processed
// in descending order.

export interface PlateInventoryEntry {
  /** Single-plate weight, e.g. 20. */
  weight: number;
  /** How many you own in total (across both sides). */
  count: number;
}

export interface PlateLoad {
  /** Plates loaded on each side, heaviest first. */
  perSide: number[];
  /** Bar + 2× sum(perSide). */
  total: number;
}

export interface PlateCalcInput {
  target: number;
  barWeight: number;
  inventory: readonly PlateInventoryEntry[];
}

export type PlateCalcResult =
  | { kind: 'exact'; load: PlateLoad }
  | {
      kind: 'closest';
      load: PlateLoad;
      /** Diff to the requested target (positive = over, negative = under). */
      delta: number;
    }
  | { kind: 'under-bar'; load: PlateLoad }
  | { kind: 'empty-inventory'; load: PlateLoad };

const EPS = 0.0001;

/** Round to a fixed grid (1/100 kg) so floating-point arithmetic
 * doesn't fragment otherwise-equal totals into separate map keys. */
function snap(x: number): number {
  return Math.round(x * 100) / 100;
}

/** All per-side totals reachable from the inventory, mapped to the
 * canonical (heaviest-first) plate composition that achieves them. */
function enumerateLoads(
  perSideInventory: readonly { weight: number; perSide: number }[],
): Map<number, number[]> {
  // Process slots descending by weight so any composition we record
  // already lists heaviest plates first.
  const sorted = [...perSideInventory].sort((a, b) => b.weight - a.weight);

  let states = new Map<number, number[]>();
  states.set(0, []);

  for (const slot of sorted) {
    if (slot.weight <= 0 || slot.perSide <= 0) continue;
    const next = new Map(states);
    for (const [total, plates] of states) {
      let cumTotal = total;
      let cumPlates = plates;
      for (let i = 0; i < slot.perSide; i++) {
        cumTotal = snap(cumTotal + slot.weight);
        cumPlates = [...cumPlates, slot.weight];
        if (!next.has(cumTotal)) next.set(cumTotal, cumPlates);
      }
    }
    states = next;
  }

  return states;
}

export function calculatePlates(input: PlateCalcInput): PlateCalcResult {
  const { target, barWeight } = input;

  const perSideInventory = input.inventory
    .filter((p) => p.weight > 0 && p.count > 0)
    .map((p) => ({ weight: p.weight, perSide: Math.floor(p.count / 2) }))
    .filter((p) => p.perSide > 0);

  if (target < barWeight - EPS) {
    return { kind: 'under-bar', load: { perSide: [], total: barWeight } };
  }

  const targetPerSide = (target - barWeight) / 2;

  if (targetPerSide < EPS) {
    return { kind: 'exact', load: { perSide: [], total: barWeight } };
  }

  if (perSideInventory.length === 0) {
    return {
      kind: 'empty-inventory',
      load: { perSide: [], total: barWeight },
    };
  }

  const reachable = enumerateLoads(perSideInventory);

  // Find the reachable total nearest the target. Tie-break: prefer the
  // lower total so the user never gets surprise extra weight.
  let bestTotal = 0;
  let bestDist = Math.abs(targetPerSide);
  for (const total of reachable.keys()) {
    const dist = Math.abs(total - targetPerSide);
    if (dist < bestDist - EPS) {
      bestDist = dist;
      bestTotal = total;
    } else if (Math.abs(dist - bestDist) < EPS && total < bestTotal) {
      bestTotal = total;
    }
  }

  const plates = reachable.get(bestTotal) ?? [];
  const totalLoaded = barWeight + 2 * bestTotal;

  if (bestDist < EPS) {
    return { kind: 'exact', load: { perSide: plates, total: totalLoaded } };
  }

  return {
    kind: 'closest',
    load: { perSide: plates, total: totalLoaded },
    delta: snap(totalLoaded - target),
  };
}
