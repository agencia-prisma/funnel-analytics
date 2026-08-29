import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';

import './globals.css';

export const metadata: Metadata = {
  description: 'Analytics determinístico para funis de aquisição e vendas.',
  title: {
    default: 'Funnel Analytics',
    template: '%s | Funnel Analytics',
  },
};

export default function RootLayout({
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
