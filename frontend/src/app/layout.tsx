import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Study Hub - AI Study Assistant',
  description: 'Multi-Agent Student Productivity Platform with Voice-First AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
