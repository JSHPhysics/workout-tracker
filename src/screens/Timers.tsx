import { useEffect, useRef, useState } from 'react';
import { CircularProgress } from '../components/CircularProgress';
import { NumberStepper } from '../components/NumberStepper';
import { useWakeLock } from '../lib/wakeLock';
import { cueIntervalEnd, cueTick, primeAudio } from '../lib/cue';

type Mode = 'stopwatch' | 'countdown' | 'interval';

const MODES: { value: Mode; label: string }[] = [
  { value: 'stopwatch', label: 'Stopwatch' },
  { value: 'countdown', label: 'Countdown' },
  { value: 'interval', label: 'Interval' },
];

export function Timers() {
  const [mode, setMode] = useState<Mode>('interval');

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 pb-20">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          Standalone
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          Timers
        </h1>
        <p className="text-sm text-fg-muted">
          For circuits, EMOM/Tabata, or just the clock.
        </p>
      </header>

      <div role="tablist" aria-label="Timer mode" className="flex gap-1">
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.value)}
              className={[
                'flex-1 min-h-[40px] rounded-full border px-3 text-sm font-medium tracking-wide transition',
                active
                  ? 'border-transparent bg-accent text-accent-fg'
                  : 'border-line bg-surface text-fg-soft hover:border-line-strong',
              ].join(' ')}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'stopwatch' && <Stopwatch />}
      {mode === 'countdown' && <Countdown />}
      {mode === 'interval' && <IntervalTimer />}
    </section>
  );
}

// --- Stopwatch -------------------------------------------------------------

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed =
    accumulatedMs + (running && startedAt ? now - startedAt : 0);

  const start = () => {
    primeAudio();
    setStartedAt(Date.now());
    setNow(Date.now());
    setRunning(true);
  };
  const pause = () => {
    if (!startedAt) return;
    setAccumulatedMs((a) => a + (Date.now() - startedAt));
    setStartedAt(null);
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    setStartedAt(null);
    setAccumulatedMs(0);
  };

  return (
    <article className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <div
        className="font-mono text-5xl font-light tabular-nums tracking-tight text-fg"
        aria-live="polite"
      >
        {formatHMS(elapsed)}
      </div>
      <div className="flex gap-2">
        {!running ? (
          <PrimaryButton onClick={start}>
            {accumulatedMs > 0 ? 'Resume' : 'Start'}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={pause}>Pause</PrimaryButton>
        )}
        <SecondaryButton onClick={reset} disabled={accumulatedMs === 0 && !running}>
          Reset
        </SecondaryButton>
      </div>
    </article>
  );
}

// --- Countdown -------------------------------------------------------------

function Countdown() {
  const [minutes, setMinutes] = useState(2);
  const [seconds, setSeconds] = useState(0);
  const totalConfiguredMs = (minutes * 60 + seconds) * 1000;

  const [running, setRunning] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cueFired = useRef(false);

  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  const remaining = running
    ? deadline
      ? Math.max(0, deadline - now)
      : 0
    : (pausedRemaining ?? totalConfiguredMs);

  useEffect(() => {
    if (running && remaining <= 0 && !cueFired.current) {
      cueFired.current = true;
      cueIntervalEnd();
      setRunning(false);
      setDeadline(null);
      setPausedRemaining(0);
    }
  }, [running, remaining]);

  const start = () => {
    primeAudio();
    cueFired.current = false;
    const ms = pausedRemaining && pausedRemaining > 0
      ? pausedRemaining
      : totalConfiguredMs;
    if (ms <= 0) return;
    setDeadline(Date.now() + ms);
    setPausedRemaining(null);
    setNow(Date.now());
    setRunning(true);
  };
  const pause = () => {
    if (!deadline) return;
    setPausedRemaining(Math.max(0, deadline - Date.now()));
    setDeadline(null);
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    setDeadline(null);
    setPausedRemaining(null);
    cueFired.current = false;
  };

  const progress =
    totalConfiguredMs > 0 ? 1 - remaining / totalConfiguredMs : 0;

  return (
    <article className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-surface p-6 shadow-soft">
      {!running && pausedRemaining === null ? (
        <div className="flex items-center gap-3">
          <NumberStepper
            value={minutes}
            onChange={setMinutes}
            step={1}
            min={0}
            max={120}
            ariaLabel="Minutes"
            format={(v) => `${v} min`}
            width={5}
          />
          <NumberStepper
            value={seconds}
            onChange={setSeconds}
            step={5}
            min={0}
            max={55}
            ariaLabel="Seconds"
            format={(v) => `${v} s`}
            width={5}
          />
        </div>
      ) : (
        <CircularProgress
          progress={progress}
          size={180}
          stroke={8}
          trackClassName="text-line"
          fillClassName="text-accent"
          ariaLabel={`${formatHMS(remaining)} remaining`}
        >
          <span className="font-mono text-3xl font-light tabular-nums text-fg">
            {formatHMS(remaining)}
          </span>
        </CircularProgress>
      )}
      <div className="flex gap-2">
        {!running ? (
          <PrimaryButton onClick={start} disabled={totalConfiguredMs === 0}>
            {pausedRemaining && pausedRemaining > 0 ? 'Resume' : 'Start'}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={pause}>Pause</PrimaryButton>
        )}
        <SecondaryButton onClick={reset} disabled={!running && pausedRemaining === null}>
          Reset
        </SecondaryButton>
      </div>
    </article>
  );
}

// --- Interval (EMOM / Tabata / generic) ------------------------------------

type Phase = 'work' | 'rest';

interface IntervalConfig {
  workSec: number;
  restSec: number;
  rounds: number;
}

const PRESETS: { name: string; config: IntervalConfig }[] = [
  { name: 'EMOM', config: { workSec: 60, restSec: 0, rounds: 10 } },
  { name: 'Tabata', config: { workSec: 20, restSec: 10, rounds: 8 } },
  { name: '40/20', config: { workSec: 40, restSec: 20, rounds: 8 } },
];

function IntervalTimer() {
  const [config, setConfig] = useState<IntervalConfig>(PRESETS[1]!.config);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>('work');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);

  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  // Phase-end transitions: when remaining hits zero, advance.
  useEffect(() => {
    if (!running || deadline === null) return;
    const remaining = deadline - now;
    if (remaining > 0) return;

    // Advance.
    if (phase === 'work') {
      if (config.restSec > 0) {
        cueTick();
        setPhase('rest');
        setDeadline(Date.now() + config.restSec * 1000);
        return;
      }
      // No rest configured (EMOM-style) — straight to next round.
    }

    // We were resting (or work-with-no-rest); next round or end.
    if (round >= config.rounds) {
      cueIntervalEnd();
      setRunning(false);
      setDeadline(null);
      setDone(true);
      return;
    }

    cueTick();
    setRound((r) => r + 1);
    setPhase('work');
    setDeadline(Date.now() + config.workSec * 1000);
  }, [running, deadline, now, phase, round, config]);

  const phaseTotalMs =
    (phase === 'work' ? config.workSec : config.restSec) * 1000;
  const remaining =
    running && deadline !== null ? Math.max(0, deadline - now) : 0;
  const progress = phaseTotalMs > 0 ? 1 - remaining / phaseTotalMs : 0;

  const start = () => {
    primeAudio();
    setRunning(true);
    setRound(1);
    setPhase('work');
    setDeadline(Date.now() + config.workSec * 1000);
    setNow(Date.now());
    setDone(false);
  };
  const stop = () => {
    setRunning(false);
    setDeadline(null);
    setDone(false);
  };

  if (running || done) {
    return (
      <article className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
            {done ? 'Done' : phase === 'work' ? 'Work' : 'Rest'}
          </span>
          <span className="font-mono text-xs tabular-nums text-fg-muted">
            Round {Math.min(round, config.rounds)}/{config.rounds}
          </span>
        </div>
        <CircularProgress
          progress={done ? 1 : progress}
          size={200}
          stroke={10}
          trackClassName={
            phase === 'rest' && !done ? 'text-line' : 'text-line'
          }
          fillClassName={
            done
              ? 'text-accent'
              : phase === 'work'
                ? 'text-accent'
                : 'text-fg-muted'
          }
          ariaLabel={done ? 'Done' : `${formatHMS(remaining)} ${phase}`}
        >
          <span className="font-display text-4xl font-light tabular-nums text-fg">
            {done ? '✓' : formatHMS(remaining)}
          </span>
        </CircularProgress>
        <SecondaryButton onClick={stop}>
          {done ? 'Reset' : 'Stop'}
        </SecondaryButton>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setConfig({ ...p.config })}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium tracking-wide transition',
              configMatches(config, p.config)
                ? 'border-transparent bg-accent text-accent-fg'
                : 'border-line bg-surface-soft text-fg-soft hover:border-line-strong',
            ].join(' ')}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Work">
          <NumberStepper
            value={config.workSec}
            onChange={(v) => setConfig({ ...config, workSec: v })}
            step={5}
            min={5}
            max={600}
            ariaLabel="Work seconds"
            format={(v) => `${v}s`}
            width={5}
          />
        </Field>
        <Field label="Rest">
          <NumberStepper
            value={config.restSec}
            onChange={(v) => setConfig({ ...config, restSec: v })}
            step={5}
            min={0}
            max={300}
            ariaLabel="Rest seconds"
            format={(v) => `${v}s`}
            width={5}
          />
        </Field>
        <Field label="Rounds">
          <NumberStepper
            value={config.rounds}
            onChange={(v) => setConfig({ ...config, rounds: v })}
            step={1}
            min={1}
            max={50}
            ariaLabel="Rounds"
            format={(v) => `${v}`}
            width={4}
          />
        </Field>
        <Field label="Total">
          <span className="font-mono text-sm tabular-nums text-fg-muted">
            {formatHMS(
              (config.workSec + config.restSec) * config.rounds * 1000,
            )}
          </span>
        </Field>
      </div>

      <PrimaryButton onClick={start} className="self-center">
        Start
      </PrimaryButton>
    </article>
  );
}

function configMatches(a: IntervalConfig, b: IntervalConfig): boolean {
  return a.workSec === b.workSec && a.restSec === b.restSec && a.rounds === b.rounds;
}

// --- Building blocks --------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

function PrimaryButton({ onClick, disabled, className, children }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-fg shadow-lift transition hover:opacity-90 disabled:opacity-50',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, className, children }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex min-h-[48px] items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-fg transition hover:bg-surface-soft disabled:opacity-50',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// --- Time formatting --------------------------------------------------------

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
