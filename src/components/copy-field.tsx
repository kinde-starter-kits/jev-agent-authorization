'use client';

import {useState} from 'react';

export function CopyField({label, value}: {label: string; value: string}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-line bg-card">
        <pre className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-xs leading-relaxed">
          {value}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 border-l border-line px-3 text-xs font-medium hover:bg-track"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
