/**
 * QR Code Display Component
 * Renders QR code for WhatsApp authentication with enhanced animations
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  qrCode: string;
  expiresIn?: number; // seconds until QR code expires
}

export default function QRCodeDisplay({ qrCode, expiresIn = 60 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeLeft, setTimeLeft] = useState(expiresIn);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (qrCode && canvasRef.current) {
      // Generate QR code on canvas
      QRCode.toCanvas(
        canvasRef.current,
        qrCode,
        {
          width: 280,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        },
        (error) => {
          if (error) {
            console.error('[QRCodeDisplay] Error generating QR code:', error);
          }
        }
      );
    }

    // Reset timer when QR code changes
    setTimeLeft(expiresIn);
    setIsExpired(false);
  }, [qrCode, expiresIn]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  if (!qrCode) {
    return null;
  }

  const progress = (timeLeft / expiresIn) * 100;
  const isLowTime = timeLeft <= 10;

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* QR Code container with animated gradient border */}
      <div className="relative">
        {/* Animated gradient border */}
        <div className="gradient-border rounded-2xl p-1">
          <div className="relative overflow-hidden rounded-xl bg-white p-4 dark:bg-slate-900">
            {/* Scanning line animation */}
            <div
              className="pointer-events-none absolute inset-x-4 h-1 rounded-full bg-gradient-to-r from-transparent via-primary-400 to-transparent opacity-60"
              style={{
                animation: 'scan 2s ease-in-out infinite',
              }}
            />

            {/* QR Code canvas */}
            <canvas ref={canvasRef} className="relative z-10 block" />

            {/* Corner decorations */}
            <div className="absolute left-2 top-2 h-6 w-6 border-l-2 border-t-2 border-primary-400 rounded-tl-lg" />
            <div className="absolute right-2 top-2 h-6 w-6 border-r-2 border-t-2 border-primary-400 rounded-tr-lg" />
            <div className="absolute bottom-2 left-2 h-6 w-6 border-b-2 border-l-2 border-primary-400 rounded-bl-lg" />
            <div className="absolute bottom-2 right-2 h-6 w-6 border-b-2 border-r-2 border-primary-400 rounded-br-lg" />

            {/* Expired overlay */}
            {isExpired && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/90 backdrop-blur-sm dark:bg-slate-900/90">
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-warning-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    QR Code Expired
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Waiting for new code...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp logo badge */}
        <div className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] shadow-lg">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
      </div>

      {/* Countdown timer */}
      {!isExpired && (
        <div className="w-full max-w-[280px] space-y-2">
          {/* Progress bar */}
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isLowTime
                  ? 'bg-gradient-to-r from-warning-400 to-error-500'
                  : 'bg-gradient-to-r from-primary-400 to-primary-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Timer text */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Code refreshes automatically
            </span>
            <span
              className={`font-medium ${
                isLowTime
                  ? 'text-warning-600 dark:text-warning-400'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* Instructions */}
      <p className="max-w-[280px] text-center text-sm text-slate-500 dark:text-slate-400">
        Scan this QR code with your WhatsApp mobile app to connect
      </p>

      {/* Scanning line animation keyframes - added via style tag */}
      <style jsx>{`
        @keyframes scan {
          0%,
          100% {
            top: 1rem;
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          50% {
            top: calc(100% - 1rem);
            opacity: 0.6;
          }
          60% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
