import { useEffect, useMemo, useState } from 'react';
import { cueCelebration } from '../lib/cue';
import type { PRAward } from '../domain/pr-detection';
import type { Exercise, PRType } from '../types';

interface Props {
  awards: PRAward[];
  exerciseMap: Map<string, Exercise> | undefined;
  onClose: () => void;
}

const PR_LABEL: Record<PRType, string> = {
  weight: 'Weight',
  reps_at_weight: 'Reps @ weight',
  e1rm: 'Estimated 1RM',
  session_volume: 'Session volume',
};

function fmt(v: number): string {
  return v % 1 === 0 ? `${v}` : v.toFixed(1);
}

function unit(type: PRType): string {
  switch (type) {
    case 'weight':
    case 'e1rm':
      return ' kg';
    case 'reps_at_weight':
      return ' reps';
    case 'session_volume':
      return ' kg total';
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export function PRCelebration({ awards, exerciseMap, onClose }: Props) {
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // Group awards by exercise so the modal reads as a per-lift summary
  // rather than a flat list of types.
  const grouped = useMemo(() => {
    const map = new Map<string, PRAward[]>();
    for (const a of awards) {
      const arr = map.get(a.exerciseId) ?? [];
      arr.push(a);
      map.set(a.exerciseId, arr);
    }
    return Array.from(map.entries());
  }, [awards]);

  // Fire the party-blower the moment the modal mounts. Skipped under
  // reduced-motion so users who quiet the visual fanfare also get
  // sonic restraint.
  useEffect(() => {
    if (awards.length === 0) return;
    if (reducedMotion) return;
    cueCelebration();
  }, [awards.length, reducedMotion]);

  if (awards.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New personal records"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-5 py-10 backdrop-blur"
    >
      {!reducedMotion && <Confetti />}
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-accent/40 bg-surface p-6 shadow-lift">
        <header className="flex flex-col gap-1 text-center">
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-accent">
            New PR{awards.length === 1 ? '' : 's'}
          </span>
          <h2 className="font-display text-3xl font-light leading-tight">
            {awards.length === 1
              ? 'Single-rep glory.'
              : awards.length <= 3
                ? 'Stacked it.'
                : 'On fire.'}
          </h2>
          <p className="text-sm text-fg-muted">
            {awards.length} record{awards.length === 1 ? '' : 's'} broken this
            session.
          </p>
        </header>

        <ul className="flex flex-col gap-3">
          {grouped.map(([exerciseId, list]) => {
            const ex = exerciseMap?.get(exerciseId);
            return (
              <li
                key={exerciseId}
                className="rounded-2xl border border-line bg-surface-soft/60 p-3"
              >
                <p className="font-display text-base font-medium">
                  {ex?.name ?? 'Exercise'}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {list.map((a, i) => (
                    <li
                      key={`${a.type}-${i}`}
                      className="flex items-baseline gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[0.7rem] font-medium text-accent"
                    >
                      <span>{PR_LABEL[a.type]}</span>
                      <span className="tabular-nums text-fg">
                        {fmt(a.value)}
                        {unit(a.type)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mx-auto inline-flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-fg shadow-soft transition hover:opacity-90"
        >
          Nice
        </button>
      </div>
    </div>
  );
}

// --- Confetti --------------------------------------------------------------

const PIECE_COUNT = 60;

interface Piece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotation: number;
  hue: number;
  size: number;
}

function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const next: Piece[] = Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.6 + Math.random() * 1.4,
      rotation: Math.random() * 360,
      hue: 20 + Math.random() * 60, // warm-editorial palette range
      size: 6 + Math.random() * 6,
    }));
    setPieces(next);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10%] block opacity-90"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.4}px`,
            background: `hsl(${p.hue} 80% 60%)`,
            transform: `rotate(${p.rotation}deg)`,
            animation: `pr-fall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes pr-fall {
          0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(0, 110vh, 0) rotate(720deg); opacity: 0.1; }
        }
      `}</style>
    </div>
  );
}
