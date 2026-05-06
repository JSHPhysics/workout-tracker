interface Props {
  title: string;
  description: string;
}

export function PlaceholderScreen({ title, description }: Props) {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Placeholder · content lands in a later milestone
      </div>
    </section>
  );
}
