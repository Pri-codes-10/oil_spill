import React, { useState } from 'react';
import { ActiveTab, OperationNotification } from '../types';
import { APP_LOGO } from '../data';
import {
  Bell,
  HelpCircle,
  Search,
  Check,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  ChevronDown,
  Sun,
  Moon
} from 'lucide-react';

interface TopAppBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  notifications: OperationNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<OperationNotification[]>>;
  onOpenHelp: () => void;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
}


export const TopAppBar: React.FC<TopAppBarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  notifications,
  setNotifications,
  onOpenHelp,
  theme = 'light',
  toggleTheme
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = notifications.filter(n => n.unread).length;

  const getStageInfo = () => {
    switch (activeTab) {
      case 'ingest':
        return { stage: 'Stage 1/4: Data Ingestion', nextTab: 'map' as ActiveTab };
      case 'map':
      case 'detection':
        return { stage: 'Stage 2/4: Detection Analysis', nextTab: 'drift' as ActiveTab };
      case 'drift':
        return { stage: 'Stage 3/4: Drift Modelling', nextTab: 'suspects' as ActiveTab };
      case 'suspects':
        return { stage: 'Stage 4/4: Vessel Attribution', nextTab: 'export' as ActiveTab };
      case 'export':
        return { stage: 'Case Conclusion & Export', nextTab: 'ingest' as ActiveTab };
      default:
        return { stage: 'Stage 2/4: Detection Analysis', nextTab: 'drift' as ActiveTab };
    }
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const stageInfo = getStageInfo();

  return (
    <header
      id="top-app-bar"
      className="fixed top-0 left-0 w-full z-40 transition-colors"
      style={{ background: 'var(--gov-surface)', borderBottom: '1px solid var(--gov-border)' }}
    >
      {/* Tricolour stripe at very top */}
      <div className="gov-saffron-stripe w-full" />

      {/* Main header row */}
      <div className="flex items-center justify-between pr-6 pl-10 h-16">

        {/* Left: Emblem + Branding */}
        <div
          onClick={() => setActiveTab('ingest')}
          className="flex items-center gap-3 cursor-pointer group"
          title="SpillTrace — Marine Pollution Surveillance Portal"
        >
          {/* Government emblem */}
          <div className="shrink-0">
            <img src={APP_LOGO} alt="SpillTrace" className="w-7 h-7 object-contain" />
          </div>

          {/* App name + subtitle */}
          <div className="flex flex-col leading-tight">
            <span
              className="font-bold tracking-tight"
              style={{ color: 'var(--gov-navy)', fontFamily: 'var(--font-gov)', fontSize: '22px' }}
            >
              SpillTrace
            </span>
          </div>
        </div>

        {/* Centre: Stage breadcrumb */}
        <div
          className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded"
          style={{ background: 'var(--gov-navy-light)', border: '1px solid var(--gov-border)' }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--gov-navy)', fontFamily: 'var(--font-mono)' }}
          >
            {stageInfo.stage}
          </span>
        </div>

        {/* Right: Search + Notifications + Theme Toggle + Help */}
        <div className="flex items-center gap-2">

          {/* Search bar */}
          <div className="relative hidden lg:block">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gov-text-muted)' }} />
            <input
              id="global-search"
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search vessels, incidents..."
              className="pl-8 pr-3 py-1.5 text-md rounded-2xl w-100"
              style={{
                background: 'var(--gov-surface-alt)',
                border: '1.5px solid var(--gov-border)',
                color: 'var(--gov-text-primary)',
                fontFamily: 'var(--font-gov)',
                outline: 'none'
              }}
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              id="notifications-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: showNotifications ? 'var(--gov-navy-light)' : 'var(--gov-surface-alt)',
                border: '1px solid var(--gov-border)',
                color: 'var(--gov-text-secondary)',
                cursor: 'pointer'
              }}
              title="System Alerts & Operational Logs"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center"
                  style={{ background: 'var(--gov-error)', fontSize: '9px', fontWeight: 700 }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div
                id="notifications-panel"
                className="absolute right-0 top-10 w-80 z-50 shadow-xl"
                style={{
                  background: 'var(--gov-surface)',
                  border: '1px solid var(--gov-border)',
                  borderTop: '3px solid var(--gov-navy)',
                  borderRadius: '2px'
                }}
              >
                {/* Dropdown header */}
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
                >
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>
                    Operational Alerts
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: 'var(--gov-green)', cursor: 'pointer' }}
                    >
                      <Check className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="px-4 py-3 flex gap-3 text-xs transition-colors"
                      style={{
                        borderBottom: '1px solid var(--gov-border)',
                        background: notif.unread ? 'var(--gov-surface-hover)' : 'transparent'
                      }}
                    >
                      <div className="mt-0.5 shrink-0">
                        {notif.type === 'alert' && <AlertTriangle className="w-4 h-4" style={{ color: 'var(--gov-error)' }} />}
                        {notif.type === 'info' && <Info className="w-4 h-4" style={{ color: 'var(--gov-navy)' }} />}
                        {notif.type === 'success' && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--gov-green)' }} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>{notif.title}</span>
                          <span className="font-mono text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>{notif.time}</span>
                        </div>
                        <p style={{ color: 'var(--gov-text-secondary)', lineHeight: '1.5' }}>{notif.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle (Light / Dark) */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="theme-toggle-btn"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 hover:-rotate-12 transition-transform" />
            )}
          </button>

          {/* Help */}
          <button
            id="help-btn"
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              background: 'var(--gov-surface-alt)',
              border: '1px solid var(--gov-border)',
              color: 'var(--gov-text-secondary)',
              cursor: 'pointer'
            }}
            title="User Manual & System Information"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Help</span>
          </button>
        </div>
      </div>

      {/* Bottom accent line: thin green */}
      <div style={{ height: '2px', background: 'var(--gov-green)' }} />
    </header>
  );
};
