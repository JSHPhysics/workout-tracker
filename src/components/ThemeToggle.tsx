import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '../state/theme';

const OPTIONS: { value: ThemePreference; label: string; glyph: string }[] = [
  { value: 'light', label: 'Light theme', glyph: '☀' },
  { value: 'system', label: 'System theme', glyph: '◐' },
  { value: 'dark', label: 'Dark theme', glyph: '☾' },
];

interface Props {
  className?: string;
}

// Three-pill segmented control for theme preference. Compact enough for the
// app header and the profile picker; we'll likely promote a richer version
// into Settings later.
export function ThemeToggle({ className = '' }: Props) {
  const pref = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Theme"
      className={[
        'inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900',
        className,
      ].join(' ')}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setThemePreference(opt.value)}
            aria-pressed={active}
            aria-label={opt.label}
            title={opt.label}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full text-sm transition',
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            ].join(' ')}
          >
            <span aria-hidden>{opt.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
