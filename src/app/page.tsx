import Link from 'next/link';
import {ConvexWithKinde} from '@/components/convex-provider';
import {LedgerWall} from '@/components/ledger-wall';
import {StatsCard} from '@/components/stats-card';

const STEPS = [
  {
    name: 'Kinde',
    text: 'Signs the user in and passes their token through MCP. The guard reads their organization, permissions and feature flags.'
  },
  {
    name: 'Jev',
    text: 'Reads the call, the request and what the agent read. Returns typed probabilities in about 200 ms.'
  },
  {
    name: 'Policy',
    text: 'Code decides from the numbers. The call runs, waits for a fresh sign-in, or stops.'
  }
];

export default function Home() {
  return (
    <ConvexWithKinde>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-6">
            <p className="font-mono text-xs text-muted">
              Jev agent authorization · Kinde + Jev
            </p>
            <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-7xl">
              Every agent call stops at the gate.
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Permissions say what a user can do. They do not say what the user
              asked for. Jev Gatehouse checks both on every tool call, before it
              runs.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/playground"
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
              >
                Try to trick the agent
              </Link>
              <Link
                href="/console"
                className="rounded-md border border-line px-4 py-2 text-sm font-medium"
              >
                Open the agent console
              </Link>
              <Link
                href="/benchmark"
                className="rounded-md border border-line px-4 py-2 text-sm font-medium"
              >
                See the benchmark
              </Link>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.name}
                  className="flex flex-col gap-1 border-t-2 border-ink pt-3"
                >
                  <span className="font-mono text-[11px] text-faint">
                    0{index + 1}
                  </span>
                  <span className="font-display text-xl font-extrabold">
                    {step.name}
                  </span>
                  <span className="text-sm text-muted">{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
          <StatsCard />
        </section>

        <LedgerWall />
      </main>
    </ConvexWithKinde>
  );
}
