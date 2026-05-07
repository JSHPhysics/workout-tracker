// Compact phase pill — used on the Today screen header and on each
// PR Timeline row. Renders nothing when there's no cycle data
// (caller is responsible for the periodTrackingEnabled gate).

import {
  CYCLE_PHASE_COLORS,
  CYCLE_PHASE_LABELS,
  type CyclePhase,
} from '../types';

interface Props {
  phase: CyclePhase;
  /** Optional day-of-cycle prefix ("Day 8 · Follicular"). Omit for
   * compact contexts like inline PR-row chips. */
  dayOfCycle?: number;
  overdue?: boolean;
  /** When true, render as a tappable button (parent handles onClick). */
  asButton?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CycleChip({
  phase,
  dayOfCycle,
  overdue,
  asButton = false,
  onClick,
  className,
}: Props) {
  const colour = CYCLE_PHASE_COLORS[phase];
  const label = CYCLE_PHASE_LABELS[phase];
  const content = (
    <>
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: colour }}
      />
      <span className="text-[0.65rem] font-medium tabular-nums">
        {dayOfCycle !== undefined ? `Day ${dayOfCycle} · ` : ''}
        {label}
      </span>
      {overdue && (
        <span className="text-[0.55rem] uppercase tracking-[0.16em] text-fg-faint">
          overdue
        </span>
      )}
    </>
  );
  const baseClass = [
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
    asButton
      ? 'transition hover:opacity-80'
      : '',
    className ?? '',
  ].join(' ');
  const style = {
    borderColor: `${colour}55`,
    background: `${colour}14`,
    color: colour,
  };

  if (asButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={baseClass}
        style={style}
        aria-label={`Cycle ${dayOfCycle !== undefined ? `day ${dayOfCycle}, ` : ''}${label} phase`}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className={baseClass}
      style={style}
      title={`${label} phase${dayOfCycle !== undefined ? ` (day ${dayOfCycle})` : ''}`}
    >
      {content}
    </span>
  );
}
