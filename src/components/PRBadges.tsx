import type { PRType } from '../types';

const SHORT: Record<PRType, string> = {
  weight: 'Weight PR',
  reps_at_weight: 'Reps PR',
  e1rm: 'e1RM PR',
  session_volume: 'Volume PR',
};

interface Props {
  types: readonly PRType[];
  className?: string;
}

export function PRBadges({ types, className }: Props) {
  if (types.length === 0) return null;
  return (
    <ul
      aria-label="Personal records achieved on this set"
      className={[
        'flex flex-wrap gap-1.5 pt-1',
        className ?? '',
      ].join(' ')}
    >
      {types.map((t) => (
        <li
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-accent-fg shadow-soft"
        >
          <span aria-hidden>★</span>
          <span>{SHORT[t]}</span>
        </li>
      ))}
    </ul>
  );
}
