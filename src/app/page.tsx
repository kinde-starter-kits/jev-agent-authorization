import Link from 'next/link';
import {ConvexWithKinde} from '@/components/convex-provider';
import {LedgerWall} from '@/components/ledger-wall';
import {StatsCard} from '@/components/stats-card';

const STEPS = [
  {
    title: 'Kinde',
    text: 'Checks who the agent acts for, the organization, the permission and the feature flag.'
  },
  {
    title: 'Jev',
    text: 'Reads the call, the user request and the content the agent read. Returns calibrated signals in about 200 ms.'
  },
  {
    title: 'Policy',
    text: 'Code decides from the signals: allow the call, ask the user to approve it, or stop it.'
  }
];

export default function Home() {
  return (
    <ConvexWithKinde>
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-8 lg:sticky lg:top-10 lg:self-start">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-accent">
              Jev agent authorization
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance">
              Every agent tool call is checked before it runs.
            </h1>
            <p className="text-muted">
              An AI agent calls this workspace through Kinde MCP with the
              user&apos;s token. The guard checks each call with Kinde and Jev,
              and writes every decision to this ledger.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/console"
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
              >
                Open the agent console
              </Link>
            </div>
          </div>

          <ol className="flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs text-muted">
                  {index + 1}
                </span>
                <p className="text-sm">
                  <span className="font-semibold">{step.title}.</span>{' '}
                  <span className="text-muted">{step.text}</span>
                </p>
              </li>
            ))}
          </ol>

          <StatsCard />
        </div>

        <LedgerWall />
      </main>
    </ConvexWithKinde>
  );
}
