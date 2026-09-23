'use client';

import {useQuery} from 'convex/react';
import {api} from '../../../convex/_generated/api';
import {CalibrationChart} from '@/components/bench/calibration-chart';
import {MetricBars} from '@/components/bench/metric-bars';
import {
  ARM_META,
  ARM_ORDER,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  MAX_ERROR_RATE,
  pct,
  usd3,
  type ArmKey,
  type BenchLatest
} from '@/lib/bench';

type Arms = BenchLatest['summary']['arms'];

function pick(arms: Arms, read: (arm: Arms[ArmKey]) => number) {
  return Object.fromEntries(
    ARM_ORDER.map((key) => [key, read(arms[key])])
  ) as Record<ArmKey, number>;
}

function ms(value: number | null) {
  return value === null ? '—' : `${Math.round(value).toLocaleString()} ms`;
}

function Headline({arms}: {arms: Arms}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {ARM_ORDER.map((key) => {
        const arm = arms[key];
        return (
          <li
            key={key}
            className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-sm ${ARM_META[key].swatch}`} />
              <span className="font-semibold">{ARM_META[key].label}</span>
            </div>
            <p className="text-xs text-muted">{ARM_META[key].detail}</p>
            <div className="flex flex-col">
              <span className="text-xs text-muted">False-allow rate</span>
              <span className="font-mono text-3xl font-semibold tabular-nums">
                {pct(arm.falseAllowRate)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">Accuracy</dt>
              <dd className="text-right font-mono">{pct(arm.accuracy)}</dd>
              <dt className="text-muted">p50 / p95</dt>
              <dd className="text-right font-mono">
                {ms(arm.p50Ms)} / {ms(arm.p95Ms)}
              </dd>
              <dt className="text-muted">Per 1,000 calls</dt>
              <dd className="text-right font-mono">
                {usd3(arm.costPer1000Usd)}
              </dd>
              <dt className="text-muted">Errors</dt>
              <dd className="text-right font-mono">{pct(arm.errorRate)}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryTable({arms}: {arms: Arms}) {
  const categories = CATEGORY_ORDER.filter((c) =>
    arms.gatehouse.byCategory.some((row) => row.category === c)
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="p-3 font-medium">Category</th>
            {ARM_ORDER.map((key) => (
              <th key={key} className="p-3 font-medium">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-sm ${ARM_META[key].swatch}`}
                  />
                  {ARM_META[key].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category} className="border-b border-line last:border-0">
              <td className="p-3">
                {CATEGORY_LABEL[category] ?? category}
                <span className="block text-xs text-faint">
                  {arms.gatehouse.byCategory.find(
                    (c) => c.category === category
                  )?.n ?? 0}{' '}
                  verdicts
                </span>
              </td>
              {ARM_ORDER.map((key) => {
                const row = arms[key].byCategory.find(
                  (c) => c.category === category
                );
                const accuracy = row?.accuracy ?? 0;
                return (
                  <td key={key} className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-track">
                        <span
                          className={`block h-full ${ARM_META[key].swatch}`}
                          style={{width: pct(accuracy, 0)}}
                        />
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        {pct(accuracy, 0)}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Benchmark() {
  const latest = useQuery(api.bench.results.latest, {});
  const progress = useQuery(api.bench.results.progress, {});

  if (latest === undefined) {
    return <div className="h-96 animate-pulse rounded-2xl bg-track" />;
  }
  if (latest === null) {
    return (
      <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
        No finished benchmark run yet. Run <code>npm run bench</code>.
      </p>
    );
  }

  const {arms, calibration} = latest.summary;
  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted">
        {latest.caseCount} labeled cases, each run {latest.repeats} times per
        arm. Jev model {latest.jevModel}. LLM judge {latest.llmModel}. Policy{' '}
        {latest.policyVersion}. Finished{' '}
        {new Date(latest.finishedAt).toLocaleString()}.
        {progress?.status === 'running' &&
          ` A new run is in progress (${progress.chunksDone} of ${progress.chunksTotal}).`}
      </p>

      {ARM_ORDER.filter((key) => arms[key].errorRate > MAX_ERROR_RATE).map(
        (key) => (
          <p
            key={key}
            role="alert"
            className="rounded-xl border border-deny/40 bg-deny-soft p-4 text-sm text-deny"
          >
            {ARM_META[key].label}: {pct(arms[key].errorRate)} of calls failed in
            this run. Its numbers are not valid. Failed calls count as step-up.
          </p>
        )
      )}

      <Headline arms={arms} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Safety and usefulness</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricBars
            title="False-allow rate"
            note="Share of calls that should not run, but were allowed."
            values={pick(arms, (a) => a.falseAllowRate)}
            format={(v) => pct(v)}
            max={Math.max(
              0.05,
              ...ARM_ORDER.map((k) => arms[k].falseAllowRate)
            )}
            lowerIsBetter
          />
          <MetricBars
            title="False-block rate"
            note="Share of safe, requested calls that were not allowed."
            values={pick(arms, (a) => a.falseBlockRate)}
            format={(v) => pct(v)}
            lowerIsBetter
          />
          <MetricBars
            title="Accuracy"
            note="Share of verdicts that match the label exactly."
            values={pick(arms, (a) => a.accuracy)}
            format={(v) => pct(v)}
            max={1}
          />
          <MetricBars
            title="Flip rate"
            note="Share of cases where the 3 runs did not agree."
            values={pick(arms, (a) => a.flipRate)}
            format={(v) => pct(v)}
            max={Math.max(0.05, ...ARM_ORDER.map((k) => arms[k].flipRate))}
            lowerIsBetter
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Speed and cost</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricBars
            title="Latency p50"
            note="Median time for one verdict. Reads that skip Jev are not counted."
            values={pick(arms, (a) => a.p50Ms ?? 0)}
            format={(v) => `${Math.round(v).toLocaleString()} ms`}
            lowerIsBetter
          />
          <MetricBars
            title="Cost per 1,000 calls"
            note="Measured from OpenRouter usage for every call."
            values={pick(arms, (a) => a.costPer1000Usd)}
            format={usd3}
            lowerIsBetter
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Accuracy by category</h2>
        <CategoryTable arms={arms} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Is Jev calibrated?</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <CalibrationChart
            title="Follows injected text"
            points={calibration.injected.points}
            ece={calibration.injected.ece}
            n={calibration.injected.n}
          />
          <CalibrationChart
            title="Matches the request"
            points={calibration.matchesIntent.points}
            ece={calibration.matchesIntent.ece}
            n={calibration.matchesIntent.n}
          />
        </div>
      </section>
    </div>
  );
}
