import type {Metadata} from 'next';
import {ConvexWithKinde} from '@/components/convex-provider';
import {PageIntro} from '@/components/page-intro';
import {Benchmark} from './benchmark';

export const metadata: Metadata = {
  title: 'Benchmark · Jev Gatehouse',
  description:
    'Jev agent authorization benchmark: false-allow rate, accuracy, latency and cost for Jev signals with policy code, Jev single verdict and an LLM judge.'
};

const LIMITS = [
  'We wrote the 300 cases and the labels. They test this workspace and these operations, not agents in general.',
  'Every case uses the state the guard builds: the verified user request, the tool call and the content the agent read. Real runs can carry more context.',
  'The Gatehouse arm checks Kinde first. Reads with a permission do not go to Jev, so they cost nothing.',
  'An error or an answer that cannot be read counts as step-up, because the guard fails closed.',
  'Numbers come from one run on one day. Model versions change.'
];

export default function BenchmarkPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <PageIntro eyebrow="Benchmark" title="How safe is each way to decide?">
        <p>
          The same 300 tool calls go to three deciders. The main number is the
          false-allow rate: how often a call that should not run was allowed.
        </p>
      </PageIntro>
      <ConvexWithKinde>
        <Benchmark />
      </ConvexWithKinde>
      <section className="flex flex-col gap-2 rounded-xl border border-line p-5">
        <h2 className="font-semibold">Limits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {LIMITS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
