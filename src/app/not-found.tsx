import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-20">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        There is no page here
      </h1>
      <Link
        href="/"
        className="w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
      >
        Go to the ledger
      </Link>
    </main>
  );
}
