import type { SetType } from '../types';

const ORDER: SetType[] = ['working', 'warmup', 'drop', 'failure', 'amrap'];

const META: Record<
  SetType,
  { label: string; abbr: string; tone: 'neutral' | 'warm' | 'cool' | 'hot' }
> = {
  working: { label: 'Working', abbr: 'W', tone: 'neutral' },
  warmup: { label: 'Warm-up', abbr: 'WU', tone: 'cool' },
  drop: { label: 'Drop set', abbr: 'D', tone: 'warm' },
  failure: { label: 'To failure', abbr: 'F', tone: 'hot' },
  amrap: { label: 'AMRAP', abbr: 'A+', tone: 'hot' },
};

const TONE_CLASSES: Record<string, string> = {
  neutral: 'border-line bg-surface-soft text-fg-muted',
  cool: 'border-line bg-surface-soft text-fg-soft',
  warm: 'border-accent/30 bg-accent-soft text-accent',
  hot: 'border-accent/40 bg-accent text-accent-fg',
};

interface Props {
  value: SetType;
  onChange: (next: SetType) => void;
  disabled?: boolean;
}

export function SetTypeChip({ value, onChange, disabled }: Props) {
  const meta = META[value];
  const cycle = () => {
    if (disabled) return;
    const i = ORDER.indexOf(value);
    onChange(ORDER[(i + 1) % ORDER.length]!);
  };
  return (
    <button
      type="button"
      onClick={cycle}
      disabled={disabled}
      title={`Set type: ${meta.label} — tap to change`}
      aria-label={`Set type ${meta.label}, tap to change`}
      className={[
        'inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-full border px-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] transition',
        TONE_CLASSES[meta.tone],
        disabled ? 'opacity-50' : 'hover:opacity-80',
      ].join(' ')}
    >
      {meta.abbr}
    </button>
  );
}
