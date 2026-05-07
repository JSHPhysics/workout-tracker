// Reusable single-select chip group for ratings (RPE, mood, energy,
// anything else). Tapping the active chip clears the selection.
// Extracted from the original RPE picker in SetRow's `SetExtras`.

interface Option {
  value: number;
  /** Visible label inside the chip. Short (1–4 chars) for numeric
   * ratings, a single emoji glyph for mood/energy. */
  label: string;
  /** Optional secondary label rendered under the chip when set. */
  sub?: string;
}

interface Props {
  value: number | null;
  onChange: (next: number | null) => void;
  options: readonly Option[];
  disabled?: boolean;
  /** Aria label for the surrounding chip group. */
  ariaLabel: string;
  /** When `true` the chip is large enough to comfortably fit an emoji
   * + sub-label below. Defaults to `false` (compact pill). */
  emoji?: boolean;
}

export function RatingChips({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  emoji = false,
}: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-end gap-1"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? null : opt.value)}
            disabled={disabled}
            aria-pressed={active}
            aria-label={opt.sub ? `${opt.sub} (${opt.label})` : `${opt.value}`}
            className={[
              'flex flex-col items-center justify-center transition',
              emoji
                ? 'min-h-[52px] min-w-[52px] gap-0.5 rounded-2xl px-2 py-1.5 text-lg leading-none'
                : 'min-h-[32px] min-w-[32px] rounded-full px-2 text-[0.7rem] font-medium tabular-nums',
              active
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-soft text-fg-muted hover:bg-surface-elevated hover:text-fg',
              disabled ? 'cursor-not-allowed opacity-50' : '',
            ].join(' ')}
          >
            <span aria-hidden>{opt.label}</span>
            {opt.sub && emoji && (
              <span
                aria-hidden
                className={[
                  'text-[0.55rem] uppercase tracking-[0.1em]',
                  active ? 'text-accent-fg/80' : 'text-fg-faint',
                ].join(' ')}
              >
                {opt.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
