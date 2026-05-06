interface Props {
  title: string;
  description: string;
  /** Optional tag rendered above the title in display italic. */
  eyebrow?: string;
}

export function PlaceholderScreen({ title, description, eyebrow }: Props) {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        {eyebrow && (
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            {eyebrow}
          </span>
        )}
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-fg-muted">{description}</p>
      </header>
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface-soft/50 p-8 text-center text-sm text-fg-muted">
        <span className="font-display italic">Soon.</span>
        <span className="mx-2 text-fg-faint">·</span>
        Wires in a later milestone.
      </div>
    </section>
  );
}
