// Static SVG diagram library. Stick figures, not anatomical illustrations
// — clarity over realism. Each diagram is a single React component
// returning an SVG sized to viewBox 0 0 100 80; the wrapper applies
// fixed display dimensions and theme-coloured strokes.
//
// Add diagrams as `'<slug>': () => JSX` entries in DIAGRAMS. Exercises
// reference them via `Exercise.diagram = '<slug>'`.

import type { ReactNode } from 'react';

const stroke = 'rgb(var(--fg))';
const accent = 'rgb(var(--accent))';
const muted = 'rgb(var(--fg-muted))';

interface FigureProps {
  /** Optional CSS class for the SVG wrapper. */
  className?: string | undefined;
}

// --- Drawing primitives ----------------------------------------------------

function Body({
  cx,
  cy,
  scale = 1,
  pose,
}: {
  cx: number;
  cy: number;
  scale?: number;
  pose: PoseSpec;
}): ReactNode {
  // Treat the body as 8 segments: head, neck-shoulders, torso, upper
  // arm, forearm, thigh, shin, foot. Each pose just supplies a set of
  // joint coordinates relative to a 1x1 reference; we scale + translate.
  const j = pose;
  const k = (x: number, y: number): [number, number] => [
    cx + x * scale,
    cy + y * scale,
  ];
  const [hx, hy] = k(j.head[0], j.head[1]);
  const [nx, ny] = k(j.neck[0], j.neck[1]);
  const [sx, sy] = k(j.shoulder[0], j.shoulder[1]);
  const [ex, ey] = k(j.elbow[0], j.elbow[1]);
  const [wx, wy] = k(j.wrist[0], j.wrist[1]);
  const [hipX, hipY] = k(j.hip[0], j.hip[1]);
  const [kx, ky] = k(j.knee[0], j.knee[1]);
  const [ax, ay] = k(j.ankle[0], j.ankle[1]);

  return (
    <g
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {/* head */}
      <circle cx={hx} cy={hy} r={2.6 * scale} fill={muted} stroke="none" />
      {/* spine: neck → hip */}
      <line x1={nx} y1={ny} x2={hipX} y2={hipY} />
      {/* shoulder line */}
      <line x1={nx} y1={ny} x2={sx} y2={sy} />
      {/* arm */}
      <line x1={sx} y1={sy} x2={ex} y2={ey} />
      <line x1={ex} y1={ey} x2={wx} y2={wy} />
      {/* leg */}
      <line x1={hipX} y1={hipY} x2={kx} y2={ky} />
      <line x1={kx} y1={ky} x2={ax} y2={ay} />
    </g>
  );
}

interface PoseSpec {
  head: [number, number];
  neck: [number, number];
  shoulder: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
}

function Frame({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <svg
      viewBox="0 0 100 80"
      role="img"
      aria-hidden
      className={['h-32 w-full', className ?? ''].join(' ')}
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  );
}

function Floor(): ReactNode {
  return (
    <line
      x1={6}
      y1={70}
      x2={94}
      y2={70}
      stroke={muted}
      strokeWidth={0.8}
      strokeDasharray="2 2"
    />
  );
}

function Bar({
  cx,
  cy,
  width = 50,
  showPlates = true,
}: {
  cx: number;
  cy: number;
  width?: number;
  showPlates?: boolean;
}): ReactNode {
  return (
    <g>
      <line
        x1={cx - width / 2}
        y1={cy}
        x2={cx + width / 2}
        y2={cy}
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {showPlates && (
        <>
          <rect x={cx - width / 2 - 4} y={cy - 5} width={3} height={10} fill={accent} />
          <rect x={cx + width / 2 + 1} y={cy - 5} width={3} height={10} fill={accent} />
        </>
      )}
    </g>
  );
}

function Bench({ cx, cy }: { cx: number; cy: number }): ReactNode {
  return (
    <g stroke={muted} strokeWidth={1.2} fill="none">
      <line x1={cx - 22} y1={cy} x2={cx + 22} y2={cy} />
      <line x1={cx - 18} y1={cy} x2={cx - 18} y2={cy + 8} />
      <line x1={cx + 18} y1={cy} x2={cx + 18} y2={cy + 8} />
    </g>
  );
}

// --- Diagrams --------------------------------------------------------------

function Squat(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={36}
        scale={6}
        pose={{
          head: [0, -3.2],
          neck: [0, -1.5],
          shoulder: [-1.2, -1],
          elbow: [-1.4, 0.4],
          wrist: [-1, 1.6],
          hip: [0.2, 1.2],
          knee: [-1.2, 3.2],
          ankle: [-0.4, 5.6],
        }}
      />
      <Bar cx={50} cy={26} width={56} />
    </Frame>
  );
}

function Deadlift(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={40}
        scale={5.5}
        pose={{
          head: [1.4, -3.4],
          neck: [0.6, -1.8],
          shoulder: [0, -0.8],
          elbow: [-0.4, 1.2],
          wrist: [-0.6, 3],
          hip: [-1.6, -0.2],
          knee: [-1, 3.2],
          ankle: [-0.6, 5.4],
        }}
      />
      <Bar cx={47} cy={66} width={48} />
    </Frame>
  );
}

function BenchPress(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Bench cx={50} cy={50} />
      {/* lying body */}
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <line x1={28} y1={48} x2={70} y2={48} />
        <circle cx={26} cy={47} r={2.6} fill={muted} stroke="none" />
        {/* arms straight up */}
        <line x1={56} y1={48} x2={56} y2={32} />
        <line x1={62} y1={48} x2={62} y2={32} />
      </g>
      <Bar cx={59} cy={30} width={44} />
    </Frame>
  );
}

function OverheadPress(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={36}
        scale={6}
        pose={{
          head: [0, -3.2],
          neck: [0, -1.6],
          shoulder: [-1.2, -1],
          elbow: [-1.4, -2.4],
          wrist: [-1.2, -4.4],
          hip: [0, 1.2],
          knee: [-0.4, 3.4],
          ankle: [-0.4, 5.6],
        }}
      />
      <Bar cx={50} cy={6} width={42} />
    </Frame>
  );
}

function HipThrust(): ReactNode {
  return (
    <Frame>
      <Floor />
      {/* bench profile (shoulder support) */}
      <g stroke={muted} strokeWidth={1.4} fill="none">
        <line x1={20} y1={48} x2={36} y2={48} />
        <line x1={20} y1={48} x2={20} y2={70} />
      </g>
      {/* lying-bridge body */}
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <circle cx={22} cy={42} r={2.6} fill={muted} stroke="none" />
        <line x1={24} y1={44} x2={56} y2={44} />
        <line x1={56} y1={44} x2={62} y2={66} />
        <line x1={62} y1={66} x2={66} y2={70} />
      </g>
      <Bar cx={54} cy={42} width={32} />
    </Frame>
  );
}

function PullUp(): ReactNode {
  return (
    <Frame>
      <line x1={18} y1={14} x2={82} y2={14} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={20} y1={6} x2={20} y2={14} stroke={muted} strokeWidth={1} />
      <line x1={80} y1={6} x2={80} y2={14} stroke={muted} strokeWidth={1} />
      <Body
        cx={50}
        cy={42}
        scale={5}
        pose={{
          head: [0, -4],
          neck: [0, -2.6],
          shoulder: [-1.4, -2],
          elbow: [-1.6, -3.6],
          wrist: [-1.4, -5.6],
          hip: [0, 1],
          knee: [-0.6, 3.4],
          ankle: [-0.4, 5.6],
        }}
      />
    </Frame>
  );
}

function PushUp(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        {/* head */}
        <circle cx={28} cy={48} r={2.6} fill={muted} stroke="none" />
        {/* body line */}
        <line x1={32} y1={50} x2={84} y2={62} />
        {/* arm support */}
        <line x1={36} y1={50} x2={36} y2={64} />
        {/* legs (single line) */}
        <line x1={84} y1={62} x2={88} y2={68} />
      </g>
    </Frame>
  );
}

function Row(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={42}
        scale={5.5}
        pose={{
          head: [1.4, -2.2],
          neck: [0.6, -1.2],
          shoulder: [-0.2, -0.4],
          elbow: [-0.4, 1.4],
          wrist: [-0.4, 2.8],
          hip: [-1.6, 0],
          knee: [-1.6, 2.8],
          ankle: [-1, 5.2],
        }}
      />
      <Bar cx={48} cy={56} width={40} />
    </Frame>
  );
}

function Lunge(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={36}
        scale={6}
        pose={{
          head: [0.2, -3.4],
          neck: [0, -1.8],
          shoulder: [-0.6, -1],
          elbow: [-0.8, 0.6],
          wrist: [-0.8, 2.2],
          hip: [0, 1.4],
          knee: [1.6, 3.4],
          ankle: [2.6, 5.6],
        }}
      />
      {/* trailing leg */}
      <line x1={50} y1={45} x2={42} y2={64} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={42} y1={64} x2={36} y2={70} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Frame>
  );
}

function Plank(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <circle cx={24} cy={50} r={2.6} fill={muted} stroke="none" />
        <line x1={28} y1={52} x2={84} y2={64} />
        {/* forearm support */}
        <line x1={32} y1={52} x2={32} y2={66} />
        <line x1={28} y1={66} x2={36} y2={66} />
        {/* feet */}
        <line x1={84} y1={64} x2={88} y2={68} />
      </g>
    </Frame>
  );
}

function HamstringStretch(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <circle cx={20} cy={62} r={2.6} fill={muted} stroke="none" />
        <line x1={24} y1={64} x2={48} y2={66} />
        {/* arms reaching up to the foot */}
        <line x1={42} y1={66} x2={66} y2={36} />
        {/* raised leg */}
        <line x1={48} y1={66} x2={70} y2={32} />
        {/* support leg */}
        <line x1={48} y1={66} x2={80} y2={66} />
      </g>
    </Frame>
  );
}

function ChildPose(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <circle cx={32} cy={56} r={2.6} fill={muted} stroke="none" />
        {/* curled torso forward */}
        <path d="M 36 58 Q 56 56 60 64" />
        {/* arms reaching forward */}
        <line x1={36} y1={58} x2={20} y2={62} />
        {/* folded leg */}
        <line x1={60} y1={64} x2={70} y2={68} />
      </g>
    </Frame>
  );
}

function HipFlexorStretch(): ReactNode {
  return (
    <Frame>
      <Floor />
      <Body
        cx={50}
        cy={36}
        scale={6}
        pose={{
          head: [0.2, -3.4],
          neck: [0, -1.8],
          shoulder: [-0.6, -1],
          elbow: [-0.8, 0],
          wrist: [-1.2, 1.4],
          hip: [0, 1.4],
          knee: [1.6, 3.4],
          ankle: [3, 5.6],
        }}
      />
      {/* trailing knee on the floor */}
      <line x1={50} y1={45} x2={36} y2={64} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={36} y1={64} x2={26} y2={66} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Frame>
  );
}

function Butterfly(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        {/* head */}
        <circle cx={50} cy={36} r={2.6} fill={muted} stroke="none" />
        {/* upright torso */}
        <line x1={50} y1={38} x2={50} y2={56} />
        {/* legs forming a diamond, soles together */}
        <line x1={50} y1={56} x2={32} y2={64} />
        <line x1={32} y1={64} x2={50} y2={68} />
        <line x1={50} y1={56} x2={68} y2={64} />
        <line x1={68} y1={64} x2={50} y2={68} />
        {/* arms reaching to the feet */}
        <line x1={50} y1={42} x2={42} y2={62} />
        <line x1={50} y1={42} x2={58} y2={62} />
      </g>
    </Frame>
  );
}

function Pancake(): ReactNode {
  return (
    <Frame>
      <Floor />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        {/* head pitched forward */}
        <circle cx={50} cy={50} r={2.6} fill={muted} stroke="none" />
        {/* hinged torso */}
        <line x1={50} y1={52} x2={50} y2={62} />
        {/* arms reaching forward to the floor */}
        <line x1={50} y1={54} x2={36} y2={68} />
        <line x1={50} y1={54} x2={64} y2={68} />
        {/* wide-straddle legs */}
        <line x1={50} y1={62} x2={20} y2={68} />
        <line x1={50} y1={62} x2={80} y2={68} />
      </g>
    </Frame>
  );
}

function CalfStretch(): ReactNode {
  return (
    <Frame>
      <Floor />
      {/* wall */}
      <line x1={20} y1={14} x2={20} y2={70} stroke={muted} strokeWidth={1.4} />
      <Body
        cx={56}
        cy={40}
        scale={5}
        pose={{
          head: [-2.4, -3.4],
          neck: [-2.2, -2],
          shoulder: [-2, -1.2],
          elbow: [-3.6, -0.4],
          wrist: [-5.4, 0.4],
          // back leg (the working calf) extended back-and-down to the floor
          hip: [0.4, 1.2],
          knee: [2.4, 3.4],
          ankle: [4.4, 5.6],
        }}
      />
      {/* front (planted) leg, bent */}
      <line x1={56} y1={45} x2={42} y2={66} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={42} y1={66} x2={36} y2={70} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
    </Frame>
  );
}

function FoamRoll(): ReactNode {
  return (
    <Frame>
      <Floor />
      {/* foam roller */}
      <ellipse cx={50} cy={64} rx={10} ry={4} fill={accent} stroke="none" opacity={0.8} />
      <g stroke={stroke} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <circle cx={26} cy={50} r={2.6} fill={muted} stroke="none" />
        <line x1={28} y1={52} x2={62} y2={62} />
        <line x1={62} y1={62} x2={84} y2={66} />
        {/* arms behind */}
        <line x1={32} y1={52} x2={26} y2={64} />
      </g>
    </Frame>
  );
}

// --- Registry --------------------------------------------------------------

export const DIAGRAMS: Record<string, () => ReactNode> = {
  squat: Squat,
  deadlift: Deadlift,
  'bench-press': BenchPress,
  'overhead-press': OverheadPress,
  'hip-thrust': HipThrust,
  'pull-up': PullUp,
  'push-up': PushUp,
  row: Row,
  lunge: Lunge,
  plank: Plank,
  'hamstring-stretch': HamstringStretch,
  'child-pose': ChildPose,
  'hip-flexor-stretch': HipFlexorStretch,
  butterfly: Butterfly,
  pancake: Pancake,
  'calf-stretch': CalfStretch,
  'foam-roll': FoamRoll,
};

export function ExerciseDiagram({
  slug,
  className,
}: { slug: string | undefined } & FigureProps): ReactNode {
  if (!slug) return <DiagramPlaceholder className={className} />;
  const renderer = DIAGRAMS[slug];
  if (!renderer) return <DiagramPlaceholder className={className} />;
  // Apply the wrapper className via a render-prop dance — simpler to
  // just clone here, but the registry returns a tree already; render
  // it inside an explicit container.
  return (
    <div className={className}>
      {renderer()}
    </div>
  );
}

function DiagramPlaceholder({ className }: FigureProps): ReactNode {
  return (
    <div
      className={[
        'flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-line bg-surface-soft/40 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint',
        className ?? '',
      ].join(' ')}
    >
      diagram coming soon
    </div>
  );
}
