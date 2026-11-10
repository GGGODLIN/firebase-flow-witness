import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowWitness · Hybrid UI & State Verification Workbench',
  description:
    'Beat 0 pixel/DOM diff, Beat 1 on-device Gemini Nano triage and Beat 2 Cloud Gemini root cause, built on Firebase AI Logic hybrid inference.',
};

export const viewport: Viewport = {
  themeColor: '#060a12',
  colorScheme: 'dark',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="bg-[#060a12]">
      <body className="min-h-screen bg-[#060a12] font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
