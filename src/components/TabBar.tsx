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
      className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [
              'flex min-h-[48px] flex-col items-center justify-center gap-0.5 py-2 text-xs',
              isActive
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-slate-500 dark:text-slate-400',
            ].join(' ')
          }
        >
          <span aria-hidden className="text-lg leading-none">
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
