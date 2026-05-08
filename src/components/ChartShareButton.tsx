import { useState } from 'react';
import { captureSvgAsPng } from '../lib/captureSvgAsPng';
import { shareImage, type ImageShareOutcome } from '../lib/shareImage';

interface Props {
  /** Ref to a wrapper that contains the chart's <svg>. The button
   * captures the first svg child. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Filename for the PNG (download fallback + share-sheet preview). */
  filename: string;
  /** Optional title for the OS share sheet. */
  title?: string;
  /** Background painted into the captured PNG so the chart has a
   * proper backdrop in chat apps with arbitrary themes. Default white
   * — readable in both dark and light chat threads. */
  background?: string;
}

/** Small ↗ button that captures a chart SVG to PNG and either opens
 * the OS share sheet (mobile) or triggers a download (desktop). The
 * outcome flashes briefly via the title attribute so the user gets
 * feedback even though there's no inline label. */
export function ChartShareButton({
  containerRef,
  filename,
  title,
  background = '#ffffff',
}: Props) {
  const [outcome, setOutcome] = useState<ImageShareOutcome | 'idle'>('idle');
  const [busy, setBusy] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setOutcome('idle');
    try {
      const container = containerRef.current;
      if (!container) {
        setOutcome('error');
        return;
      }
      const blob = await captureSvgAsPng(container, {
        background,
        padding: 16,
      });
      const result = await shareImage(
        blob,
        filename,
        title ? { title } : {},
      );
      setOutcome(result);
    } catch (err) {
      console.error('Chart share failed:', err);
      setOutcome('error');
    } finally {
      setBusy(false);
    }
  };

  const tooltip =
    outcome === 'shared'
      ? 'Shared'
      : outcome === 'downloaded'
        ? 'Downloaded'
        : outcome === 'error'
          ? "Couldn't share"
          : outcome === 'cancelled'
            ? 'Share chart as image'
            : 'Share chart as image';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Share chart as image"
      title={tooltip}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-faint transition hover:bg-surface-soft hover:text-accent disabled:opacity-50"
    >
      {busy ? (
        <span aria-hidden className="text-[0.65rem]">…</span>
      ) : (
        <span aria-hidden className="text-sm">↗</span>
      )}
    </button>
  );
}
