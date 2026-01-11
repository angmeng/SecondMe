/**
 * Root Layout
 * Defines the HTML structure and global styles for the entire application
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

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
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  icons: {
    icon: '/favicon.ico',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 antialiased dark:bg-gray-900">
        <div className="flex min-h-screen flex-col">
          {/* Global navigation will go here in future user stories */}
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
