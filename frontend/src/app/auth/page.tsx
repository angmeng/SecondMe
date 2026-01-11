/**
 * QR Code Authentication Page
 * Displays QR code for WhatsApp authentication
 */

'use client';

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';
import QRCodeDisplay from '@/components/QRCodeDisplay';

type ConnectionStatus = 'disconnected' | 'qr' | 'authenticated' | 'ready';

export default function AuthPage() {
  const [qrCode, setQRCode] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    // Get socket instance
    const socket = socketClient.getSocket();

    // Subscribe to QR code updates
    socketClient.onQRCode((data) => {
      console.log('[Auth Page] QR code received');
      setQRCode(data.qr);
      setStatus('qr');
      setIsConnecting(false);
    });

    // Subscribe to connection status updates
    socketClient.onConnectionStatus((data) => {
      console.log('[Auth Page] Connection status:', data.status);
      setStatus(data.status);

      if (data.status === 'ready' || data.status === 'authenticated') {
        setQRCode(null);
        setIsConnecting(false);
      }
    });

    // Cleanup on unmount
    return () => {
      // Don't disconnect socket, just remove listeners
      // socket stays connected for other pages
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            WhatsApp Authentication
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Scan the QR code with your WhatsApp mobile app
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center">
          {status === 'disconnected' && (
            <span className="badge badge-error">Disconnected</span>
          )}
          {status === 'qr' && <span className="badge badge-warning">Waiting for scan</span>}
          {status === 'authenticated' && (
            <span className="badge badge-success">Authenticating...</span>
          )}
          {status === 'ready' && <span className="badge badge-success">Connected!</span>}
        </div>

        {/* QR Code Display */}
        {isConnecting && !qrCode && (
          <div className="card flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-primary-600"></div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Connecting to WhatsApp...
            </p>
          </div>
        )}

        {qrCode && <QRCodeDisplay qrCode={qrCode} />}

        {status === 'ready' && (
          <div className="card space-y-4">
            <div className="flex items-center justify-center">
              <svg
                className="h-16 w-16 text-success"
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
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Successfully Connected!
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Your WhatsApp is now connected. You can proceed to the dashboard.
              </p>
            </div>
            <div className="flex justify-center">
              <a href="/" className="btn-primary">
                Go to Dashboard
              </a>
            </div>
          </div>
        )}

        {/* Instructions */}
        {status === 'qr' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              How to scan:
            </h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Open WhatsApp on your phone</li>
              <li>
                Tap <strong>Menu</strong> or <strong>Settings</strong>
              </li>
              <li>
                Tap <strong>Linked Devices</strong>
              </li>
              <li>
                Tap <strong>Link a Device</strong>
              </li>
              <li>Point your phone at this screen to scan the QR code</li>
            </ol>
          </div>
        )}

        {/* Connection Info */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-600">
          <p>Session will be saved locally for future use</p>
          <p className="mt-1">Your messages are end-to-end encrypted</p>
        </div>
      </div>
    </div>
  );
}
