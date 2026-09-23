'use client';

import Link from 'next/link';

export default function ErrorPage({reset}: {error: Error; reset: () => void}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-20">
      <p className="text-sm font-medium text-deny">Error</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        This page did not load
      </h1>
      <p className="text-muted">
        The app could not reach its data. The guard fails closed, so no agent
        call ran because of this error.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium"
        >
          Go to the ledger
        </Link>
      </div>
    </main>
  );
}
