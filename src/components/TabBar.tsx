import { NavLink } from 'react-router-dom';

interface TabItem {
  to: string;
  label: string;
  icon: string;
}

const TABS: readonly TabItem[] = [
  { to: '/today', label: 'Today', icon: '◎' },
  { to: '/history', label: 'History', icon: '☰' },
  { to: '/progress', label: 'Progress', icon: '↗' },
  { to: '/routines', label: 'Routines', icon: '✦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export function TabBar() {
  return (
    <nav
      className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line/70 bg-bg/85 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [
              'group relative flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6rem] font-medium uppercase tracking-[0.08em] transition',
              isActive ? 'text-accent' : 'text-fg-muted hover:text-fg',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-accent"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
