import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';

import './globals.css';

export const metadata: Metadata = {
  description: 'Painel interno do Funnel Analytics.',
  robots: {
    follow: false,
    index: false,
  },
  title: 'Admin | Funnel Analytics',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={GeistSans.variable} lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
