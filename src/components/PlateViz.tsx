import { calculatePlates, type PlateInventoryEntry } from '../domain/plate-calculator';

interface Props {
  target: number;
  barWeight: number;
  inventory: readonly PlateInventoryEntry[];
  /** Optional class for the wrapper. */
  className?: string;
  /** When false, hide the result text and just show the bar viz. */
  showLabel?: boolean;
}

// Plate height + width approximations (px). Heavier plates render
// taller and slightly wider, mirrored on either side of a thin "sleeve".
function plateGeom(weight: number): { h: number; w: number } {
  // Map common gym plate weights to a visually distinguishable height.
  if (weight >= 25) return { h: 56, w: 14 };
  if (weight >= 20) return { h: 50, w: 12 };
  if (weight >= 15) return { h: 44, w: 10 };
  if (weight >= 10) return { h: 36, w: 9 };
  if (weight >= 5) return { h: 28, w: 8 };
  if (weight >= 2.5) return { h: 22, w: 6 };
  return { h: 16, w: 5 };
}

function plateLabel(w: number): string {
  return w % 1 === 0 ? `${w}` : `${w}`;
}

function fmt(v: number): string {
  return v % 1 === 0 ? `${v}` : `${v.toFixed(2).replace(/\.?0+$/, '')}`;
}

export function PlateViz({
  target,
  barWeight,
  inventory,
  className,
  showLabel = true,
}: Props) {
  const result = calculatePlates({ target, barWeight, inventory });
  const plates = result.load.perSide;

  const banner = (() => {
    switch (result.kind) {
      case 'exact':
        return null;
      case 'under-bar':
        return `Below the ${fmt(barWeight)} kg bar`;
      case 'empty-inventory':
        return 'Add plates in Settings → Equipment';
      case 'closest':
        return `Closest achievable: ${fmt(result.load.total)} kg (${result.delta > 0 ? '+' : ''}${fmt(result.delta)})`;
    }
  })();

  return (
    <div className={['flex flex-col gap-1', className ?? ''].join(' ')}>
      <div
        className="flex h-14 items-center justify-center"
        role="img"
        aria-label={
          plates.length === 0
            ? `Just the bar (${fmt(barWeight)} kg)`
            : `Per side: ${plates.map(fmt).join(', ')} kg`
        }
      >
        {/* Left collar (mirrored): plates ascend toward the sleeve, so
            we render in original (heaviest-first) order on the right
            and reverse for the left. The sleeve ("|") sits centred. */}
        <div className="flex items-center gap-[2px]">
          {[...plates].reverse().map((w, i) => (
            <Plate key={`L${i}`} weight={w} />
          ))}
        </div>
        <div
          className="mx-1 h-1.5 w-6 rounded-sm bg-line-strong"
          aria-hidden
          title="Bar"
        />
        <div className="flex items-center gap-[2px]">
          {plates.map((w, i) => (
            <Plate key={`R${i}`} weight={w} />
          ))}
        </div>
      </div>
      {showLabel && banner && (
        <p
          className={[
            'text-[0.68rem] text-center tabular-nums',
            result.kind === 'closest'
              ? 'text-fg-muted'
              : 'text-fg-faint',
          ].join(' ')}
        >
          {banner}
        </p>
      )}
    </div>
  );
}

function Plate({ weight }: { weight: number }) {
  const { h, w } = plateGeom(weight);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-sm bg-fg/85 font-mono text-[0.55rem] font-semibold leading-none text-bg shadow-soft"
      style={{ height: h, width: w }}
      aria-hidden
    >
      {plateLabel(weight)}
    </span>
  );
}
