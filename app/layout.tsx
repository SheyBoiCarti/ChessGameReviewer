import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Local Chess Game Reviewer',
  description: 'Browser-based direct Chess.com game analysis and opening tree builder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
