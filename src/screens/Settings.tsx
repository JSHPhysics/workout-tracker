import { useEffect, useState } from 'react';
import { useActiveProfile } from '../state/activeProfile';
import {
  addBarbell,
  deleteBarbell,
  setDefaultBarbell,
  setPlatesForProfile,
  updateBarbell,
  useBarbells,
  useDefaultBarbell,
  usePlateInventory,
} from '../db/equipment';
import { NumberStepper } from '../components/NumberStepper';
import { PlateViz } from '../components/PlateViz';
import type { Barbell, PlateInventoryEntry } from '../types';

export function Settings() {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          The dials
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-fg-muted">
          Profile, units, equipment, backup, theme. Filling in across milestones.
        </p>
      </header>

      <Equipment />
    </section>
  );
}

function Equipment() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const barbells = useBarbells(profileId);
  const inventory = usePlateInventory(profileId);
  const defaultBar = useDefaultBarbell(profileId);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-tight">
          Equipment
        </h2>
        <p className="text-xs text-fg-muted">
          Bars, plates, and the load-out test.
        </p>
      </header>

      <BarbellList profileId={profileId} barbells={barbells} />
      <PlateEditor profileId={profileId} inventory={inventory?.plates ?? null} />
      <LoadOutTester
        defaultBarWeight={defaultBar?.weight ?? null}
        inventory={inventory?.plates ?? null}
      />
    </section>
  );
}

// --- Barbells --------------------------------------------------------------

function BarbellList({
  profileId,
  barbells,
}: {
  profileId: string | null;
  barbells: Barbell[] | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState(20);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWeight, setEditWeight] = useState(20);

  const reset = () => {
    setAdding(false);
    setName('');
    setWeight(20);
  };

  const submit = async () => {
    if (!profileId || !name.trim()) return;
    await addBarbell({ profileId, name: name.trim(), weight, isDefault: false });
    reset();
  };

  const startEdit = (b: Barbell) => {
    setEditingId(b.id);
    setEditName(b.name);
    setEditWeight(b.weight);
  };
  const commitEdit = async () => {
    if (!editingId) return;
    await updateBarbell(editingId, { name: editName.trim(), weight: editWeight });
    setEditingId(null);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-medium">Barbells</h3>
        {barbells && (
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
            {barbells.length} · default highlighted
          </span>
        )}
      </div>

      {barbells === undefined ? (
        <div className="h-16 animate-pulse rounded-xl bg-surface-soft" />
      ) : (
        <ul className="flex flex-col gap-2">
          {barbells.map((bar) => (
            <li key={bar.id}>
              {editingId === bar.id ? (
                <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent-soft p-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <NumberStepper
                      value={editWeight}
                      onChange={setEditWeight}
                      step={0.5}
                      min={1}
                      max={50}
                      ariaLabel="Bar weight in kilograms"
                      format={(v) => `${v % 1 === 0 ? v : v.toFixed(1)} kg`}
                      width={6}
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full px-3 py-1.5 text-xs text-fg-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={commitEdit}
                        className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2',
                    bar.isDefault
                      ? 'border-accent/40 bg-accent-soft'
                      : 'border-line bg-surface-soft/50',
                  ].join(' ')}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-fg">{bar.name}</span>
                    <span className="text-xs tabular-nums text-fg-muted">
                      {bar.weight} kg
                      {bar.isDefault && (
                        <span className="ml-2 text-accent">· default</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!bar.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultBarbell(bar.id)}
                        className="rounded-full px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-accent"
                        title="Make default"
                      >
                        Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(bar)}
                      className="rounded-full px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-fg"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete "${bar.name}"?`)) {
                          void deleteBarbell(bar.id);
                        }
                      }}
                      className="rounded-full px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-accent"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent-soft p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EZ-curl bar"
            autoFocus
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <NumberStepper
              value={weight}
              onChange={setWeight}
              step={0.5}
              min={1}
              max={50}
              ariaLabel="Bar weight in kilograms"
              format={(v) => `${v % 1 === 0 ? v : v.toFixed(1)} kg`}
              width={6}
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={reset}
                className="rounded-full px-3 py-1.5 text-xs text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!name.trim()}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start rounded-full border border-dashed border-line-strong px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-fg-muted transition hover:border-accent hover:text-accent"
        >
          + Add bar
        </button>
      )}
    </article>
  );
}

// --- Plate inventory editor ------------------------------------------------

const STANDARD_WEIGHTS = [25, 20, 15, 10, 5, 2.5, 1.25];

function PlateEditor({
  profileId,
  inventory,
}: {
  profileId: string | null;
  inventory: PlateInventoryEntry[] | null;
}) {
  if (!profileId || inventory === null) {
    return (
      <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="h-24 animate-pulse rounded-xl bg-surface-soft" />
      </article>
    );
  }

  const counts = new Map<number, number>();
  for (const p of inventory) counts.set(p.weight, p.count);

  const updateCount = async (weight: number, nextCount: number) => {
    const next = new Map(counts);
    if (nextCount <= 0) next.delete(weight);
    else next.set(weight, nextCount);
    const arr: PlateInventoryEntry[] = Array.from(next.entries())
      .map(([w, c]) => ({ weight: w, count: c }))
      .filter((p) => p.count > 0);
    await setPlatesForProfile(profileId, arr);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-medium">Plate inventory</h3>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
          Total count, both sides
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {STANDARD_WEIGHTS.map((w) => {
          const count = counts.get(w) ?? 0;
          return (
            <li
              key={w}
              className="flex items-center justify-between rounded-xl border border-line bg-surface-soft/50 px-3 py-2"
            >
              <span className="font-mono text-sm tabular-nums text-fg">
                {w} kg
              </span>
              <NumberStepper
                value={count}
                onChange={(v) => void updateCount(w, v)}
                step={2}
                min={0}
                max={20}
                ariaLabel={`${w} kg plate count`}
                format={(v) => `${v}`}
                width={3}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-[0.65rem] text-fg-faint">
        Steps by 2 (one pair). Counts are total across both sides.
      </p>
    </article>
  );
}

// --- Test it widget --------------------------------------------------------

function LoadOutTester({
  defaultBarWeight,
  inventory,
}: {
  defaultBarWeight: number | null;
  inventory: PlateInventoryEntry[] | null;
}) {
  const [target, setTarget] = useState(60);

  // Re-snap when the default bar weight first arrives.
  useEffect(() => {
    if (defaultBarWeight && target < defaultBarWeight) setTarget(defaultBarWeight);
  }, [defaultBarWeight, target]);

  if (!defaultBarWeight || inventory === null) {
    return null;
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-medium">Test it</h3>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
          Bar {defaultBarWeight} kg
        </span>
      </div>
      <div className="flex items-center justify-center">
        <NumberStepper
          value={target}
          onChange={setTarget}
          step={2.5}
          min={defaultBarWeight}
          max={500}
          ariaLabel="Target weight in kilograms"
          format={(v) => `${v % 1 === 0 ? v : v.toFixed(1)} kg`}
          width={7}
        />
      </div>
      <PlateViz
        target={target}
        barWeight={defaultBarWeight}
        inventory={inventory}
      />
    </article>
  );
}
