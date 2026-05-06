import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catch-all React error boundary. Surfaces a friendly fallback
 * instead of a blank screen, with the option to reload (clears
 * Zustand store state) or reset (clears the boundary's internal
 * error so the user can try the same thing again).
 *
 * IndexedDB data is unaffected — this only catches render-time
 * errors. The user's logged sets are safe. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Print to console with the React component stack so the user can
    // include it when filing a bug. No remote telemetry — local-only app.
    console.error('App crashed:', error, info.componentStack);
  }

  reload = (): void => {
    window.location.reload();
  };

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return <Fallback error={this.state.error} onReload={this.reload} onReset={this.reset} />;
  }
}

function Fallback({
  error,
  onReload,
  onReset,
}: {
  error: Error;
  onReload: () => void;
  onReset: () => void;
}) {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-10 text-fg">
      <div className="flex max-w-md flex-col gap-4 rounded-3xl border border-line bg-surface p-6 shadow-lift">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-accent">
          Something broke
        </span>
        <h1 className="font-display text-3xl font-light leading-tight">
          We hit a snag.
        </h1>
        <p className="text-sm text-fg-muted">
          The screen crashed but your data is fine — IndexedDB is intact.
          Try the action again, or reload if it keeps happening.
        </p>
        <pre className="max-h-32 overflow-auto rounded-xl bg-surface-soft px-3 py-2 font-mono text-[0.7rem] leading-snug text-fg-muted">
          {error.message}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onReload}
            className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
          >
            Reload app
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}
