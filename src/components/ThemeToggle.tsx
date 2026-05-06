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

// Three-pill segmented control for theme preference. Compact enough for
// the picker hero and the app header.
export function ThemeToggle({ className = '' }: Props) {
  const pref = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Theme"
      className={[
        'inline-flex items-center gap-0.5 rounded-full border border-cream-200/80 bg-cream-100/70 p-0.5 backdrop-blur dark:border-cream-800/80 dark:bg-cream-900/70',
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
              'flex h-7 w-7 items-center justify-center rounded-full text-[0.85rem] transition',
              active
                ? 'bg-white text-cream-900 shadow-soft dark:bg-cream-700 dark:text-cream-50'
                : 'text-cream-500 hover:text-cream-900 dark:text-cream-400 dark:hover:text-cream-100',
            ].join(' ')}
          >
            <span aria-hidden>{opt.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
