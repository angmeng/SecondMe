/**
 * QR Code Authentication Page
 * Displays QR code for WhatsApp authentication - Redesigned
 */

'use client';

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import Link from 'next/link';

type ConnectionStatus = 'disconnected' | 'qr' | 'connected' | 'ready';

const steps = [
  { id: 1, label: 'Connect' },
  { id: 2, label: 'Scan QR' },
  { id: 3, label: 'Ready' },
];

export default function AuthPage() {
  const [qrCode, setQRCode] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isConnecting, setIsConnecting] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    socketClient.onQRCode((data) => {
      console.log('[Auth Page] QR code received');
      setQRCode(data.qr);
      setStatus('qr');
      setIsConnecting(false);
      setCurrentStep(2);
    });

    socketClient.onConnectionStatus((data) => {
      console.log('[Auth Page] Connection status:', data.status);
      setStatus(data.status);

      if (data.status === 'ready') {
        setQRCode(null);
        setIsConnecting(false);
        setCurrentStep(3);
      } else if (data.status === 'connected') {
        setIsConnecting(false);
        setCurrentStep(2);
      }
    });

    return () => {};
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/30">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            WhatsApp Authentication
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Scan the QR code with your WhatsApp mobile app
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                {/* Step circle */}
                <div
                  className={`
                    flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all
                    ${
                      currentStep >= step.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }
                    ${currentStep === step.id ? 'ring-4 ring-primary-100 dark:ring-primary-900/50' : ''}
                  `}
                >
                  {currentStep > step.id ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>
                {/* Step label */}
                <span
                  className={`ml-2 text-xs font-medium ${
                    currentStep >= step.id
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={`mx-3 h-0.5 w-8 rounded-full transition-colors ${
                      currentStep > step.id
                        ? 'bg-primary-500'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status Badge */}
        <div className="mb-6 flex justify-center">
          {status === 'disconnected' && (
            <span className="badge badge-error badge-dot">Disconnected</span>
          )}
          {status === 'qr' && (
            <span className="badge badge-warning badge-dot">Waiting for scan</span>
          )}
          {status === 'connected' && (
            <span className="badge badge-primary badge-dot">Authenticating...</span>
          )}
          {status === 'ready' && (
            <span className="badge badge-success badge-dot">Connected</span>
          )}
        </div>

        {/* Loading State */}
        {isConnecting && !qrCode && (
          <div className="card flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-slate-200 dark:border-slate-700" />
              <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary-500" />
            </div>
            <p className="mt-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              Connecting to WhatsApp...
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Please wait, this may take up to a minute
            </p>
          </div>
        )}

        {/* QR Code Display */}
        {qrCode && <QRCodeDisplay qrCode={qrCode} expiresIn={60} />}

        {/* Success State */}
        {status === 'ready' && (
          <div className="card animate-scale-in space-y-6 text-center">
            {/* Success icon */}
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
              <svg
                className="h-10 w-10 text-success-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            {/* Success message */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Successfully Connected!
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Your WhatsApp is now connected. You can proceed to the dashboard to manage your AI clone.
              </p>
            </div>

            {/* Action button */}
            <Link href="/" className="btn btn-primary w-full">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Go to Dashboard
            </Link>
          </div>
        )}

        {/* Instructions */}
        {status === 'qr' && (
          <div className="mt-6 card">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
              How to scan:
            </h3>
            <ol className="space-y-2">
              {[
                'Open WhatsApp on your phone',
                'Tap Menu or Settings',
                'Tap Linked Devices',
                'Tap Link a Device',
                'Point your phone at this screen',
              ].map((step, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Session will be saved locally for future use
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Your messages are end-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
