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

export function ThemeToggle({ className = '' }: Props) {
  const pref = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Theme"
      className={[
        'inline-flex items-center gap-0.5 rounded-full border border-line/80 bg-surface-soft/70 p-0.5 backdrop-blur',
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
                ? 'bg-surface text-fg shadow-soft'
                : 'text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            <span aria-hidden>{opt.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
