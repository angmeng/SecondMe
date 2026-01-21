/**
 * Toast Context
 * Global toast state management with provider and hook
 */

'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import Toast, { ToastVariant, ToastAction } from '@/components/ui/Toast';

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  toast: (options: Omit<ToastData, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastCount = 0;

function generateToastId(): string {
  toastCount += 1;
  return `toast-${toastCount}`;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((options: Omit<ToastData, 'id'> & { id?: string }): string => {
    const id = options.id || generateToastId();

    // Set default duration based on variant
    const defaultDuration = options.variant === 'error' ? 5000 : 3000;
    const duration = options.duration ?? defaultDuration;

    setToasts((prev) => {
      // If toast with same ID exists, update it
      const existingIndex = prev.findIndex((t) => t.id === id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...options, id, duration };
        return updated;
      }
      // Otherwise add new toast
      return [...prev, { ...options, id, duration }];
    });

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, dismissAll }}>
      {children}
      {/* Toast Container - fixed position top-right */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed right-0 top-0 z-50 flex max-h-screen flex-col gap-3 p-4 sm:p-6"
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            id={t.id}
            title={t.title}
            description={t.description}
            variant={t.variant}
            action={t.action}
            duration={t.duration}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
