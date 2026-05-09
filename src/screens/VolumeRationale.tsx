import { Link } from 'react-router-dom';

/** Read-only explainer page for the muscle volume weighting
 * defaults. Linked from the AdvancedSettings → "Why these
 * defaults?" affordance. Honest about what's well-supported in the
 * literature vs what's a practitioner heuristic. */
export function VolumeRationale() {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/settings/advanced"
          className="self-start text-[0.7rem] uppercase tracking-[0.2em] text-fg-muted hover:text-accent"
        >
          ← Advanced
        </Link>
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          Why these defaults?
        </span>
        <h1 className="font-display text-3xl font-light leading-[1.05] tracking-tight">
          Muscle volume weighting
        </h1>
        <p className="text-sm text-fg-muted">
          The Progress chart counts each set&apos;s kg·reps and
          divides that volume across the muscles the exercise
          targets. Primary muscles get 100% credit; secondary
          muscles get 50%. Here&apos;s where the numbers come from
          and why we made them adjustable.
        </p>
      </header>

      <Section title="What &lsquo;secondary&rsquo; means here">
        <p>
          A secondary muscle is one that contributes meaningfully to
          the lift but isn&apos;t the primary mover. Examples:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <span className="text-fg">Bench press</span> — primary
            chest + triceps; secondary shoulders.
          </li>
          <li>
            <span className="text-fg">Squat</span> — primary quads +
            glutes; secondary hamstrings + core.
          </li>
          <li>
            <span className="text-fg">Pull-up</span> — primary lats +
            back; secondary biceps + rear delts.
          </li>
        </ul>
      </Section>

      <Section title="Where the 0.5× number comes from">
        <p>
          The 50% credit is a coaching heuristic, popularised in
          evidence-based strength circles. Three commonly-cited
          sources:
        </p>
        <ul className="flex flex-col gap-2 pl-2">
          <Source
            href="https://renaissanceperiodization.com/articles/"
            authors="Renaissance Periodization (Dr. Mike Israetel et al.)"
          >
            RP&apos;s volume landmark framework (MEV / MAV / MRV)
            counts indirect compound work as roughly half a set
            toward the secondary muscle, balancing it against direct
            work in weekly volume tallies.
          </Source>
          <Source
            href="https://www.strongerbyscience.com/training-volume-landmarks-muscle-growth/"
            authors="Stronger by Science (Greg Nuckols)"
          >
            Uses similar half-credit accounting when assigning
            compound-lift volume to secondary muscles in their
            programmes; explicitly notes the multiplier is a
            practical heuristic rather than a measured constant.
          </Source>
          <Source
            href="https://muscleandstrengthpyramids.com/"
            authors="The Muscle and Strength Pyramid: Hypertrophy (Dr. Eric Helms et al.)"
          >
            Discusses indirect-volume contribution when planning
            weekly per-muscle volume in the &ldquo;volume&rdquo; tier
            of the pyramid.
          </Source>
        </ul>
      </Section>

      <Section title="What the actual research shows">
        <p>
          Direct work has a stronger dose-response relationship with
          muscle growth than indirect work, but indirect work
          isn&apos;t zero. The 0.5× number is a reasonable mid-point
          that fits the available evidence — not a measured value:
        </p>
        <ul className="flex flex-col gap-2 pl-2">
          <Source
            href="https://pubmed.ncbi.nlm.nih.gov/27433992/"
            authors="Schoenfeld, Ogborn & Krieger (2017)"
          >
            <em>
              &ldquo;Dose-response relationship between weekly
              resistance training volume and increases in muscle
              mass: a systematic review and meta-analysis.&rdquo;
            </em>{' '}
            J Sports Sci 35(11). Establishes a graded relationship
            between weekly sets and hypertrophy. Most studies
            measure direct work; indirect contribution is left as a
            modelling choice.
          </Source>
          <Source
            href="https://pubmed.ncbi.nlm.nih.gov/30153194/"
            authors="Schoenfeld et al. (2018)"
          >
            <em>
              &ldquo;Differential effects of attentional focus
              strategies during long-term resistance training.&rdquo;
            </em>{' '}
            Eur J Sport Sci. Found that triceps growth from compound
            pressing was meaningful but smaller than equivalent
            direct triceps work — supporting a positive but
            sub-1.0 multiplier for indirect work.
          </Source>
          <Source
            href="https://pubmed.ncbi.nlm.nih.gov/35819335/"
            authors="Wolf, Androulakis-Korakakis et al. (2023)"
          >
            <em>
              &ldquo;The minimum effective training dose required for
              1RM strength in powerlifters.&rdquo;
            </em>{' '}
            Discusses volume-counting frameworks broadly; notes
            indirect-work multipliers are pragmatic conventions, not
            scientifically-derived constants.
          </Source>
        </ul>
        <p className="text-fg-faint">
          Bottom line: 0.5 is defensible and widely used. It&apos;s
          not the only defensible choice. Some coaches use 0.33 or
          0.67 in practice — anywhere in that range is grounded.
        </p>
      </Section>

      <Section title="What this means in practice">
        <p>
          The 1.0 / 0.5 split is a starting point that matches how
          most evidence-based coaches plan and audit weekly volume.
          It&apos;s not a rule; it&apos;s a tool. Reasons you might
          adjust:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <span className="text-fg">A muscle works harder than its tag suggests.</span>{' '}
            If your front delts gas before your chest on incline
            press, you might bump shoulders to 0.75 on that exercise.
          </li>
          <li>
            <span className="text-fg">You&apos;re peaking a specific lift.</span>{' '}
            Squat-specialist programmes often count squat volume as
            100% glute work, not 50%, while you&apos;re focused on
            that lift.
          </li>
          <li>
            <span className="text-fg">You disagree with our exercise tagging.</span>{' '}
            If we marked an exercise&apos;s secondary muscles wrong
            for your style, override the row with what you actually
            feel.
          </li>
        </ul>
        <p>
          Bumping a number from 0.5 → 0.75 doesn&apos;t change what
          you do in the gym — it changes how the chart aggregates
          your historical work. Use overrides to make the chart
          match how <span className="italic">you</span> think about
          your training.
        </p>
      </Section>

      <Section title="What we don&apos;t claim">
        <ul className="list-disc pl-5">
          <li>
            That 0.5 is the &ldquo;correct&rdquo; number — it&apos;s
            a defensible default, not a measured truth.
          </li>
          <li>
            That the chart can detect a muscle being underdeveloped
            — that&apos;s a coaching judgment that depends on
            goals, body proportions, recovery, and a hundred other
            things charts can&apos;t see.
          </li>
          <li>
            That higher per-muscle volume is always better — there
            are diminishing returns and personal MRVs (maximum
            recoverable volume).
          </li>
        </ul>
        <p>
          The chart is a tool for noticing trends. The weightings
          are how you&apos;d describe your own work to yourself.
        </p>
      </Section>

      <p className="rounded-2xl border border-line bg-surface-soft/40 p-3 text-xs text-fg-muted">
        Tap{' '}
        <Link
          to="/settings/advanced"
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Advanced
        </Link>{' '}
        to add or edit per-exercise overrides.
      </p>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <h2 className="font-display text-base font-medium">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-muted">
        {children}
      </div>
    </article>
  );
}

function Source({
  href,
  authors,
  children,
}: {
  href: string;
  authors: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-0.5 rounded-lg border border-line/60 bg-surface-soft/30 p-2 text-xs">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline-offset-2 hover:underline"
      >
        {authors} ↗
      </a>
      <span className="text-fg-muted">{children}</span>
    </li>
  );
}
