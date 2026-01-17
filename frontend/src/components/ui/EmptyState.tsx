/**
 * EmptyState Component
 * Engaging empty state display with illustration and action
 */

'use client';

import Link from 'next/link';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const defaultIcon = (
    <svg
      className="h-12 w-12 text-slate-300 dark:text-slate-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );

  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      {/* Illustration/Icon container */}
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {icon || defaultIcon}
      </div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>

      {/* Description */}
      {description && (
        <p className="mb-6 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}

      {/* Action button */}
      {action && (
        <>
          {action.href ? (
            <Link href={action.href} className="btn btn-primary">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn btn-primary">
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Preset empty states for common scenarios
export function EmptyStateNoContacts() {
  return (
    <EmptyState
      icon={
        <svg
          className="h-12 w-12 text-slate-300 dark:text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      }
      title="No contacts yet"
      description="Connect your WhatsApp to see your contacts here. You can then enable or disable the bot for each contact."
      action={{
        label: 'Connect WhatsApp',
        href: '/auth',
      }}
    />
  );
}

export function EmptyStateNoActivity() {
  return (
    <EmptyState
      icon={
        <svg
          className="h-12 w-12 text-slate-300 dark:text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      }
      title="No recent activity"
      description="Activity will appear here when the bot sends or receives messages."
    />
  );
}

export function EmptyStateDisconnected() {
  return (
    <EmptyState
      icon={
        <svg
          className="h-12 w-12 text-slate-300 dark:text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      }
      title="WhatsApp not connected"
      description="Scan the QR code with your WhatsApp mobile app to get started."
      action={{
        label: 'Connect Now',
        href: '/auth',
      }}
    />
  );
}
