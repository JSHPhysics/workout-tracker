interface Props {
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  /** Optional formatter for the displayed value (e.g. "60s", "12.5 kg"). */
  format?: (v: number) => string;
  ariaLabel: string;
  /** Visual variant — used when the row is "completed" to lock affordance. */
  disabled?: boolean;
  /** Width of the centre label in `ch` units. Default 4. */
  width?: number;
}

// Custom +/− stepper. Per CLAUDE.md we never use a native <input
// type="number"> on this project — fiddly on mobile, kicks up the
// virtual keyboard, lossy decimals. Tap-to-type lands in milestone 4.
export function NumberStepper({
  value,
  onChange,
  step,
  min = 0,
  max,
  format,
  ariaLabel,
  disabled,
  width = 4,
}: Props) {
  const display = format ? format(value) : `${value}`;
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const decrement = () => {
    if (disabled || atMin) return;
    onChange(Math.max(min, value - step));
  };
  const increment = () => {
    if (disabled || atMax) return;
    onChange(max !== undefined ? Math.min(max, value + step) : value + step);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className={[
        'inline-flex items-center rounded-full border border-line bg-surface-soft text-fg',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={`${ariaLabel} decrease`}
        onClick={decrement}
        disabled={disabled || atMin}
        className="flex h-12 w-10 items-center justify-center text-base text-fg-muted transition hover:text-fg disabled:opacity-30 disabled:hover:text-fg-muted"
      >
        −
      </button>
      <span
        className="text-center font-mono text-sm tabular-nums"
        style={{ minWidth: `${width}ch` }}
        aria-live="polite"
      >
        {display}
      </span>
      <button
        type="button"
        aria-label={`${ariaLabel} increase`}
        onClick={increment}
        disabled={disabled || atMax}
        className="flex h-12 w-10 items-center justify-center text-base text-fg-muted transition hover:text-fg disabled:opacity-30 disabled:hover:text-fg-muted"
      >
        +
      </button>
    </div>
  );
}
