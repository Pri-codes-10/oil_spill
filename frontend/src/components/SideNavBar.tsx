import React from 'react';
import { ActiveTab } from '../types';
import { APP_LOGO } from '../data';
import {
  Upload,
  Globe,
  Radar,
  Activity,
  Ship,
  Download,
  UserCheck
} from 'lucide-react';

interface SideNavBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenOperatorProfile: () => void;
}

export const SideNavBar: React.FC<SideNavBarProps> = ({
  activeTab,
  setActiveTab,
  onOpenOperatorProfile
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'ingest', label: 'Ingest', icon: <Upload className="w-6 h-6" /> },
    { id: 'map', label: 'Map', icon: <Globe className="w-6 h-6" /> },
    { id: 'detection', label: 'Detection', icon: <Radar className="w-6 h-6" /> },
    { id: 'drift', label: 'Drift', icon: <Activity className="w-6 h-6" /> },
    { id: 'suspects', label: 'Suspects', icon: <Ship className="w-6 h-6" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-6 h-6" /> }
  ];

  return (
    <nav
      id="side-nav-bar"
      className="fixed left-0 top-20 h-screen w-[72px] z-20 flex flex-col items-center py-3 select-none transition-colors"
      style={{
        background: 'var(--gov-surface)',
        borderRight: '1px solid var(--gov-border)',
      }}
    >
      {/* Navigation items */}
      <div className="flex flex-col gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className="w-full py-2.5 flex flex-col items-center justify-center rounded transition-all relative group"
              style={{
                background: isActive ? 'var(--gov-green-light)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--gov-green)' : '3px solid transparent',
                color: isActive ? 'var(--gov-green)' : 'var(--gov-text-secondary)',
                cursor: 'pointer'
              }}
              title={item.label}
            >
              {item.icon}
              <span
                className="text-[9px] font-semibold mt-1 tracking-tight"
                style={{ color: isActive ? 'var(--gov-green)' : 'var(--gov-text-muted)' }}
              >
                {item.label}
              </span>

              {/* Tooltip */}
              <div
                className="absolute left-[76px] px-2.5 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-md"
                style={{
                  background: 'var(--gov-surface)',
                  border: '1px solid var(--gov-border)',
                  borderLeft: '3px solid var(--gov-navy)',
                  color: 'var(--gov-text-primary)',
                  borderRadius: '2px'
                }}
              >
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Operator profile */}
      <div
        id="system-operator-badge"
        onClick={onOpenOperatorProfile}
        className="flex flex-col items-center gap-1 cursor-pointer group mb-2"
        title="Operator Profile"
      >
        <div
          className="w-9 h-9 rounded flex items-center justify-center transition-colors"
          style={{
            background: 'var(--gov-navy)',
            border: '2px solid var(--gov-border)'
          }}
        >
          <UserCheck className="w-4 h-4 text-white" />
        </div>
        <span
          className="text-[9px] font-semibold text-center leading-tight"
          style={{ color: 'var(--gov-text-muted)' }}
        >
          Operator
        </span>
      </div>

      {/* Bottom green accent */}
      <div
        className="absolute bottom-0 left-0 w-full h-1"
        style={{ background: 'var(--gov-green)' }}
      />
    </nav>
  );
};
