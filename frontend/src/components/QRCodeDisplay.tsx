/**
 * QR Code Display Component
 * Renders QR code for WhatsApp authentication
 */

'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  qrCode: string;
}

export default function QRCodeDisplay({ qrCode }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrCode && canvasRef.current) {
      // Generate QR code on canvas
      QRCode.toCanvas(
        canvasRef.current,
        qrCode,
        {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) {
            console.error('[QRCodeDisplay] Error generating QR code:', error);
          }
        }
      );
    }
  }, [qrCode]);

  if (!qrCode) {
    return null;
  }

  return (
    <div className="card flex flex-col items-center space-y-4">
      <div className="rounded-lg border-4 border-gray-200 bg-white p-4 dark:border-gray-700">
        <canvas ref={canvasRef} className="block" />
      </div>
      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        QR code refreshes automatically if not scanned
      </p>
    </div>
  );
}
