import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chess Game Reviewer',
  description: 'Private, browser-based Chess.com game review, opening exploration, and analysis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
