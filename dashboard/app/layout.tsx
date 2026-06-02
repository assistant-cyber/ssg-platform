import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SSG Dashboard — Scottish Stained Glass',
  description: 'Office dashboard for Scottish Stained Glass field assessments',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
