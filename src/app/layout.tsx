import type { Metadata } from 'next';
import './globals.css';
import { GameProvider } from '@/lib/GameContext';

export const metadata: Metadata = {
  title: 'Roblox Sage',
  description: 'A specialized search and discovery engine for Roblox experiences.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GameProvider>
          {children}
        </GameProvider>
      </body>
    </html>
  );
}
