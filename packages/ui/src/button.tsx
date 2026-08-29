import type { ComponentProps } from 'react';

import { cn } from './cn';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary';
};

export function Button({
  className,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary'
          ? 'bg-violet-500 text-white hover:bg-violet-400'
          : 'border border-white/10 bg-white/5 text-white hover:bg-white/10',
        className,
      )}
      type={type}
      {...props}
    />
  );
}
