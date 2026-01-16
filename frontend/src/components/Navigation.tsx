/**
 * Navigation Component
 * Global sidebar navigation for desktop and bottom tab bar for mobile
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { socketClient } from '@/lib/socket';
import { useToast } from '@/contexts/ToastContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    href: '/auth',
    label: 'Authentication',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
        />
      </svg>
    ),
  },
];

type ConnectionStatus = 'disconnected' | 'qr' | 'connected' | 'ready';

const DISCONNECTION_TOAST_ID = 'whatsapp-disconnected';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast, dismiss } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const initialStatus = socketClient.getLastConnectionStatus();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(initialStatus);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const prevStatusRef = useRef<ConnectionStatus>(initialStatus);

  useEffect(() => {
    // Check for dark mode preference
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);

    // Apply dark class to html element
    if (darkModeMediaQuery.matches) {
      document.documentElement.classList.add('dark');
    }

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    darkModeMediaQuery.addEventListener('change', handleChange);

    // Subscribe to connection status
    const handleConnectionStatus = (data: { status: ConnectionStatus }) => {
      // Detect transition from 'ready' to 'disconnected'
      if (prevStatusRef.current === 'ready' && data.status === 'disconnected') {
        toast({
          id: DISCONNECTION_TOAST_ID,
          variant: 'error',
          title: 'WhatsApp Disconnected',
          description: 'Your session was logged out from your device',
          action: {
            label: 'Reconnect',
            onClick: () => router.push('/auth'),
          },
          duration: 0, // persistent until dismissed
        });
      }

      // Auto-dismiss when reconnected
      if (data.status === 'ready') {
        dismiss(DISCONNECTION_TOAST_ID);
      }

      prevStatusRef.current = data.status;
      setConnectionStatus(data.status);
    };

    socketClient.onConnectionStatus(handleConnectionStatus);

    return () => {
      darkModeMediaQuery.removeEventListener('change', handleChange);
      socketClient.offConnectionStatus(handleConnectionStatus);
    };
  }, [toast, dismiss, router]);

  function toggleDarkMode() {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  }

  function getStatusColor(): string {
    switch (connectionStatus) {
      case 'ready':
        return 'status-dot-success';
      case 'connected':
        return 'status-dot-warning';
      case 'qr':
        return 'status-dot-warning';
      default:
        return 'status-dot-error';
    }
  }

  function getStatusText(): string {
    switch (connectionStatus) {
      case 'ready':
        return 'Connected';
      case 'connected':
        return 'Connecting...';
      case 'qr':
        return 'Awaiting Scan';
      default:
        return 'Disconnected';
    }
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-screen border-r border-slate-200 bg-white transition-all duration-300 ease-smooth dark:border-slate-800 dark:bg-slate-900 lg:block ${
          isExpanded ? 'w-60' : 'w-16'
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <span
                className={`font-semibold text-slate-900 transition-opacity duration-200 dark:text-white ${
                  isExpanded ? 'opacity-100' : 'opacity-0'
                }`}
              >
                SecondMe
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const isAuthDisabled = item.href === '/auth' && connectionStatus === 'ready';
              return (
                <Link
                  key={item.href}
                  href={isAuthDisabled ? '#' : item.href}
                  onClick={(e) => isAuthDisabled && e.preventDefault()}
                  title={isAuthDisabled ? 'Already connected' : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                    isAuthDisabled
                      ? 'opacity-50 cursor-not-allowed text-slate-400 dark:text-slate-500'
                      : isActive
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 ${
                      isActive && !isAuthDisabled ? 'text-primary-600 dark:text-primary-400' : ''
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={`whitespace-nowrap text-sm font-medium transition-opacity duration-200 ${
                      isExpanded ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {item.label}
                  </span>
                  {isActive && !isAuthDisabled && (
                    <span className="absolute left-0 h-8 w-1 rounded-r-full bg-primary-500" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Connection Status */}
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <div
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                isExpanded ? '' : 'justify-center'
              }`}
            >
              <div className={`status-dot ${getStatusColor()}`} />
              <div
                className={`transition-opacity duration-200 ${
                  isExpanded ? 'opacity-100' : 'hidden opacity-0'
                }`}
              >
                <p className="text-xs font-medium text-slate-900 dark:text-white">
                  {getStatusText()}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">WhatsApp</p>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <button
              onClick={toggleDarkMode}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${
                isExpanded ? '' : 'justify-center'
              }`}
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
              <span
                className={`text-sm font-medium transition-opacity duration-200 ${
                  isExpanded ? 'opacity-100' : 'hidden opacity-0'
                }`}
              >
                {isDarkMode ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isAuthDisabled = item.href === '/auth' && connectionStatus === 'ready';
            return (
              <Link
                key={item.href}
                href={isAuthDisabled ? '#' : item.href}
                onClick={(e) => isAuthDisabled && e.preventDefault()}
                title={isAuthDisabled ? 'Already connected' : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 transition-colors ${
                  isAuthDisabled
                    ? 'opacity-50 cursor-not-allowed text-slate-400 dark:text-slate-500'
                    : isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && !isAuthDisabled && (
                  <span className="absolute top-0 h-0.5 w-12 rounded-b-full bg-primary-500" />
                )}
              </Link>
            );
          })}
          {/* Connection indicator */}
          <div className="flex flex-1 flex-col items-center gap-1 py-2">
            <div className={`status-dot ${getStatusColor()}`} />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {connectionStatus === 'ready' ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </nav>
    </>
  );
}
