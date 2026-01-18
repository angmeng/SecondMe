/**
 * Root Layout
 * Defines the HTML structure and global styles for the entire application
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import Navigation from '@/components/Navigation';
import { ToastProvider } from '@/contexts/ToastContext';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SecondMe - Personal AI Clone Dashboard',
  description:
    'Monitor and control your WhatsApp AI clone. Manage personas, view conversations, and configure bot behavior in real-time.',
  keywords: [
    'whatsapp',
    'ai',
    'chatbot',
    'personal assistant',
    'automation',
    'dashboard',
  ],
  authors: [{ name: 'SecondMe' }],
  icons: {
    icon: '/favicon.ico',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Navigation />
            {/* Main content area - offset for sidebar on desktop, bottom nav on mobile */}
            <main className="flex-1 pb-20 lg:ml-20 lg:pb-0">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
