import { THEMES, THEME_LABELS, THEME_SWATCHES } from '../types';
import type { Theme } from '../types';

interface Props {
  value: Theme;
  onChange: (next: Theme) => void;
  /** Optional aria label override — defaults to a sensible string. */
  ariaLabel?: string;
}

/** Swatch-grid picker for `Theme` tokens. Used by ProfileCreate (where
 * the in-flight pick previews live) and Settings (where the pick
 * persists immediately). 3-column grid; tile shows the swatch + label. */
export function ThemePicker({ value, onChange, ariaLabel }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? 'Theme'}
      className="grid grid-cols-3 gap-2"
    >
      {THEMES.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t)}
            className={[
              'flex flex-col items-center gap-1.5 rounded-2xl border bg-surface px-2 py-3 text-xs transition',
              active
                ? 'border-accent shadow-soft'
                : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
            ].join(' ')}
          >
            <span
              aria-hidden
              className="h-6 w-6 rounded-full"
              style={{ background: THEME_SWATCHES[t] }}
            />
            <span className={active ? 'text-fg' : ''}>{THEME_LABELS[t]}</span>
          </button>
        );
      })}
    </div>
  );
}
