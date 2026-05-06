interface Props {
  /** 0..1 — fraction of the ring filled. */
  progress: number;
  /** SVG dimensions in px. */
  size?: number;
  /** Stroke width in px. */
  stroke?: number;
  /** Tailwind class for the track colour. */
  trackClassName?: string;
  /** Tailwind class for the active fill colour. */
  fillClassName?: string;
  /** Optional ARIA label. */
  ariaLabel?: string;
  children?: React.ReactNode;
}

export function CircularProgress({
  progress,
  size = 56,
  stroke = 4,
  trackClassName = 'text-line',
  fillClassName = 'text-accent',
  ariaLabel,
  children,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = c * (1 - clamped);
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          className={[fillClassName, 'transition-[stroke-dashoffset]'].join(' ')}
          style={{ transitionDuration: '250ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
