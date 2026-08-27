import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';

export type Tab = 'home' | 'library' | 'schedule' | 'announcements' | 'settings';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'library', label: 'Library', icon: 'image' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'announcements', label: 'Announcements', icon: 'messageCircle' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

interface AppShellProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  deviceCount: number;
  onAddScreen: () => void;
  children: ReactNode;
}

export function AppShell({ tab, onTabChange, deviceCount, onAddScreen, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-mobile-topbar nav">
        <span className="nav-brand">SignageMadeEasy</span>
      </div>

      <div className="app-desktop-nav nav">
        <span className="nav-brand">SignageMadeEasy</span>
        <span className="tag tag-neutral">{deviceCount} screen{deviceCount === 1 ? '' : 's'}</span>
        <button type="button" className="btn btn-primary btn-icon" aria-label="Add a screen" onClick={onAddScreen}>
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="app-desktop-layout" style={{ flex: 1 }}>
        <nav className="app-sidebar">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`app-sidebar-btn${tab === t.id ? ' is-active' : ''}`}
              onClick={() => onTabChange(t.id)}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <main className="app-content">{children}</main>
      </div>

      <nav className="app-tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`app-tabbar-btn${tab === t.id ? ' is-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <Icon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
