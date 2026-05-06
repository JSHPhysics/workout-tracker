import { useEffect, useState } from 'react';

interface Props {
  /** ISO timestamp of when the session started. */
  startedAt: string;
  /** Optional end-cap. When provided, the value is static (duration =
   * endAt − startedAt) instead of ticking against the current time. */
  endAt?: string | null;
  className?: string;
}

function format(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ElapsedTime({ startedAt, endAt, className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const live = !endAt;

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const end = endAt ? new Date(endAt).getTime() : now;
  const ms = end - new Date(startedAt).getTime();
  return (
    <span className={['font-mono tabular-nums', className ?? ''].join(' ')}>
      {format(ms)}
    </span>
  );
}
