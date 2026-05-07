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
import {
  setProfileEquipment,
  setUseBodyweightForVolume,
  useProfile,
} from '../db/profiles';
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TAGS,
  type EquipmentTag,
} from '../types';
import { clearSessionData, seedSyntheticHistory } from '../db/syntheticData';
import {
  BackupSection,
  staleness,
} from '../components/BackupSection';
import { BackupPromptModal } from '../components/BackupPromptModal';
import { NumberStepper } from '../components/NumberStepper';
import { PlateViz } from '../components/PlateViz';
import type { Barbell, PlateInventoryEntry, Profile } from '../types';

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

      <Preferences />
      <BackupHost />
      <Equipment />
      {import.meta.env.DEV && <DeveloperTools />}
    </section>
  );
}

function BackupHost() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const profile = useProfile(profileId);
  if (!profile) return null;
  return (
    <>
      <UrgentBackupBlock profile={profile} />
      <BackupSection profile={profile} />
    </>
  );
}

/** Modal-blocks the Settings page when the active profile's backup is
 * over 30 days stale, per CLAUDE.md. The user can still dismiss
 * (we're not jailing them out of changing other settings) but the
 * dismissal carries a real visual hit. */
function UrgentBackupBlock({ profile }: { profile: Profile }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const stale = staleness(profile.lastBackupAt);
  if (stale.severity !== 'urgent' || acknowledged) return null;
  return (
    <BackupPromptModal
      profile={profile}
      onClose={() => setAcknowledged(true)}
    />
  );
}

function Preferences() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const profile = useProfile(profileId);

  if (!profileId || profile === undefined) {
    return (
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="font-display text-xl font-medium tracking-tight">
            Preferences
          </h2>
        </header>
        <div className="h-16 animate-pulse rounded-2xl border border-line bg-surface-soft" />
      </section>
    );
  }
  if (!profile) return null;

  const enabled = profile.useBodyweightForVolume;

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="font-display text-xl font-medium tracking-tight">
          Preferences
        </h2>
      </header>
      <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <label className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-fg">
              Count bodyweight in volume
            </span>
            <span className="text-xs text-fg-muted">
              Push-ups, dips & co. multiply reps by your latest weigh-in
              when totalling session volume.
            </span>
          </span>
          <Toggle
            checked={enabled}
            onChange={(next) => void setUseBodyweightForVolume(profileId, next)}
            ariaLabel="Count bodyweight in volume aggregates"
          />
        </label>
      </article>
      <EquipmentPicker profile={profile} />
    </section>
  );
}

function EquipmentPicker({ profile }: { profile: Profile }) {
  const selected = new Set<EquipmentTag>(profile.equipment);
  const toggle = (tag: EquipmentTag) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    // Bodyweight is always implicitly available — keep it in the list
    // so the picker filter reads cleanly.
    next.add('bodyweight');
    void setProfileEquipment(profile.id, Array.from(next));
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-base font-medium">Available equipment</h3>
        <p className="text-xs text-fg-muted">
          The exercise picker hides anything you can't perform with this kit.
        </p>
      </header>
      <ul className="grid grid-cols-2 gap-1.5">
        {EQUIPMENT_TAGS.filter((t) => t !== 'bodyweight').map((tag) => {
          const on = selected.has(tag);
          return (
            <li key={tag}>
              <button
                type="button"
                onClick={() => toggle(tag)}
                aria-pressed={on}
                className={[
                  'w-full rounded-full border px-3 py-1.5 text-left text-xs transition',
                  on
                    ? 'border-transparent bg-accent text-accent-fg'
                    : 'border-line bg-surface-soft text-fg-muted hover:border-line-strong hover:text-fg',
                ].join(' ')}
              >
                {EQUIPMENT_LABELS[tag]}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-7 w-12 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-surface-elevated',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-0.5 h-6 w-6 rounded-full bg-bg shadow-soft transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

function DeveloperTools() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const [busy, setBusy] = useState<'seed' | 'clear' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const seed = async () => {
    if (!profileId || busy) return;
    setBusy('seed');
    setMessage(null);
    try {
      const count = await seedSyntheticHistory(profileId);
      setMessage(`Seeded ${count} synthetic sessions.`);
    } catch (err) {
      setMessage(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!profileId || busy) return;
    if (!window.confirm('Wipe all sessions, set logs and PRs for this profile?')) {
      return;
    }
    setBusy('clear');
    setMessage(null);
    try {
      await clearSessionData(profileId);
      setMessage('Cleared.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-tight">
          Developer
        </h2>
        <p className="text-xs text-fg-muted">
          Dev-only utilities. Hidden in production builds.
        </p>
      </header>
      <article className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-soft/30 p-4">
        <p className="text-sm text-fg-muted">
          Replace this profile's session history with a deterministic 12-week
          synthetic arc — handy for chart development.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={seed}
            disabled={busy !== null || !profileId}
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'seed' ? 'Seeding…' : 'Seed synthetic history'}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={busy !== null || !profileId}
            className="rounded-full border border-line px-4 py-2 text-xs text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === 'clear' ? 'Clearing…' : 'Wipe sessions'}
          </button>
        </div>
        {message && (
          <p className="text-xs text-fg-muted">{message}</p>
        )}
      </article>
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
