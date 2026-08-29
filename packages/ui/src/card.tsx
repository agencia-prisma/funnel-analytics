import type { ComponentProps } from 'react';

import { cn } from './cn';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-violet-950/10',
        className,
      )}
      {...props}
    />
  );
}
