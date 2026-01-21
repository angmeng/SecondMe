/**
 * Toast Component
 * Notification toast with variants, auto-dismiss, and optional action button
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  duration?: number; // 0 = persistent
  onDismiss: (id: string) => void;
}

const variantStyles: Record<
  ToastVariant,
  { container: string; icon: string; iconPath: string }
> = {
  success: {
    container:
      'border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950/50',
    icon: 'text-success-500',
    iconPath:
      'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  error: {
    container:
      'border-error-200 bg-error-50 dark:border-error-800 dark:bg-error-950/50',
    icon: 'text-error-500',
    iconPath:
      'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  warning: {
    container:
      'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950/50',
    icon: 'text-warning-500',
    iconPath:
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
  info: {
    container:
      'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50',
    icon: 'text-primary-500',
    iconPath:
      'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

export default function Toast({
  id,
  title,
  description,
  variant = 'info',
  action,
  duration = 3000,
  onDismiss,
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(id);
    }, 200);
  }, [id, onDismiss]);

  useEffect(() => {
    if (duration === 0) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, handleDismiss]);

  function handleAction() {
    action?.onClick();
    handleDismiss();
  }

  const styles = variantStyles[variant];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border shadow-soft-lg
        ${styles.container}
        ${isExiting ? 'animate-fade-out' : 'animate-slide-in-left'}
      `}
      style={{
        animation: isExiting
          ? 'fade-out 0.2s ease-in forwards'
          : 'slide-in-left 0.3s ease-out',
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 ${styles.icon}`}>
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d={styles.iconPath}
              />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {title}
            </p>
            {description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {description}
              </p>
            )}
            {action && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleAction}
                  className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {action.label}
                </button>
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-slate-200/50 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:hover:bg-slate-700/50 dark:hover:text-slate-300"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
