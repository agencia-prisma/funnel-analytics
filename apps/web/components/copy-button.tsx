'use client';

import { useState } from 'react';

export function CopyButton({
  value,
  label = 'Copiar',
  testId,
}: {
  value: string;
  label?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10"
      data-testid={testId}
      onClick={copy}
      type="button"
    >
      {copied ? 'Copiado' : label}
    </button>
  );
}
