import { Card } from '@funnel/ui/card';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <Card className="w-full">
        <Link
          className="text-sm font-semibold tracking-[0.18em] text-violet-300 uppercase"
          href="/"
        >
          Funnel Analytics
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="mt-6 border-t border-white/10 pt-6 text-sm text-zinc-400">
            {footer}
          </div>
        ) : null}
      </Card>
    </main>
  );
}

export function FormMessage({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  const content = error ?? message;

  if (!content) {
    return null;
  }

  return (
    <p
      className={
        error
          ? 'mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200'
          : 'mb-5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200'
      }
    >
      {content}
    </p>
  );
}

export const inputClassName =
  'mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20';
