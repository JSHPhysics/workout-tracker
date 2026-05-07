import type { SetType } from '../types';

const ORDER: SetType[] = ['working', 'warmup', 'drop', 'failure', 'amrap'];

const META: Record<
  SetType,
  { label: string; abbr: string; tone: 'neutral' | 'warm' | 'cool' | 'hot' }
> = {
  working: { label: 'Working', abbr: 'MAIN', tone: 'neutral' },
  warmup: { label: 'Warm-up', abbr: 'WARM-UP', tone: 'cool' },
  drop: { label: 'Drop set', abbr: 'DROP', tone: 'warm' },
  failure: { label: 'To failure', abbr: 'FAIL', tone: 'hot' },
  amrap: { label: 'AMRAP', abbr: 'AMRAP', tone: 'hot' },
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
        // Compact pill — width sized to content, font small enough to
        // keep the longest label ("WARM-UP") readable but unobtrusive.
        // `whitespace-nowrap` keeps the hyphenated label on one line.
        'inline-flex h-6 items-center justify-center whitespace-nowrap rounded-full border px-2 text-[0.55rem] font-semibold uppercase leading-none tracking-[0.06em] transition',
        TONE_CLASSES[meta.tone],
        disabled ? 'opacity-50' : 'hover:opacity-80',
      ].join(' ')}
    >
      {meta.abbr}
    </button>
  );
}
