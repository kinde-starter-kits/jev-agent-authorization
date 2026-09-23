import {operationById, reasonLocation} from '../api/operations';
import type {JevResult} from '../jev/client';
import type {JudgeResult} from '../jev/judge';
import {judgeWithJev} from '../guard/judgment';
import {decideKinde} from '../guard/policy';
import {buildState} from '../guard/state';
import type {BenchCase} from './cases';
import type {LlmVerdict} from './llmJudge';
import type {CalibrationRow, ResultRow} from './metrics';

type Json = Record<string, unknown>;

function parseJson(value: unknown): Json {
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Json)
      : {};
  } catch {
    return {};
  }
}

/** Turns MCP tool args into what the guard sees: path params + body, and the reason. */
export function guardArgs(c: BenchCase) {
  const operation = operationById(c.operationId);
  if (!operation) throw new Error(`Unknown operation ${c.operationId}`);
  const {body, query, ...params} = c.args;
  const fields = {...parseJson(body), ...parseJson(query)};
  const location = reasonLocation(operation);
  const raw = location === null ? undefined : fields.reason;
  const reason = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  const args: Json = {...parseJson(body), ...params};
  if (location === 'query' && reason) args.reason = reason;
  return {operation, args, reason};
}

export function stateForCase(c: BenchCase) {
  const {operation, args, reason} = guardArgs(c);
  const state = buildState(
    operation,
    args,
    reason,
    {
      served: c.contentRead.map((doc) => ({
        source: 'getDocument',
        title: doc.title,
        excerpt: doc.text,
        secondsAgo: 20
      })),
      recent: []
    },
    {source: 'verified', userRequest: c.userRequest}
  );
  return {operation, reason, state};
}

function errorNote(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 120);
}

type Base = Pick<ResultRow, 'caseId' | 'category' | 'expected' | 'repeat'>;

async function llmArm(
  base: Base,
  state: Json,
  llm: CaseDeps['llm']
): Promise<ResultRow> {
  try {
    const result = await llm(state);
    return {
      ...base,
      arm: 'llm_judge',
      // A production guard fails closed on an answer it cannot parse.
      verdict: result.verdict ?? 'step_up',
      ms: result.ms,
      costUsd: result.costUsd,
      error: false,
      parseFailed: result.verdict === null
    };
  } catch (error) {
    return {
      ...base,
      arm: 'llm_judge',
      verdict: 'step_up',
      ms: 0,
      costUsd: 0,
      error: true,
      parseFailed: false,
      note: errorNote(error)
    };
  }
}

/** The LLM arm alone, for the paced pass. */
export function runLlmCase(c: BenchCase, repeat: number, llm: CaseDeps['llm']) {
  const {state} = stateForCase(c);
  return llmArm(
    {caseId: c.id, category: c.category, expected: c.expected, repeat},
    state,
    llm
  );
}

export type CaseDeps = {
  jev: (state: Json) => Promise<JevResult>;
  judge: ((state: Json) => Promise<JudgeResult>) | null;
  llm: (state: Json) => Promise<LlmVerdict>;
};

/**
 * One repeat of one case in all three arms. Arms A and B share one Jev call,
 * as they would in production.
 */
export async function runCase(
  c: BenchCase,
  repeat: number,
  deps: CaseDeps
): Promise<{rows: ResultRow[]; calibration: CalibrationRow[]}> {
  const {operation, state} = stateForCase(c);
  const base = {
    caseId: c.id,
    category: c.category,
    expected: c.expected,
    repeat
  };

  let jevCall: Promise<JevResult> | null = null;
  const jevOnce = () => (jevCall ??= deps.jev(state));

  const [gatehouse, jevSingle, llm] = await Promise.all([
    (async (): Promise<ResultRow> => {
      // Kinde permitted the call; reads never reach Jev in the guard.
      const kinde = decideKinde(operation, {
        permission: operation.permission,
        permissionGranted: true,
        flag: operation.flag ?? null,
        flagEnabled: operation.flag ? true : null
      });
      if (kinde) {
        return {
          ...base,
          arm: 'gatehouse',
          verdict: kinde.verdict,
          ms: 0,
          costUsd: 0,
          error: false,
          parseFailed: false
        };
      }
      const started = Date.now();
      const judged = await judgeWithJev(operation, true, {
        jev: jevOnce,
        judge: deps.judge ? () => deps.judge!(state) : null
      });
      return {
        ...base,
        arm: 'gatehouse',
        verdict: judged.decision.verdict,
        ms: Date.now() - started,
        costUsd: (judged.jev?.costUsd ?? 0) + (judged.judge?.costUsd ?? 0),
        error:
          judged.jev === undefined ||
          judged.decision.reasonCode === 'judge_unavailable',
        parseFailed: false,
        note: judged.decision.reasonCode
      };
    })(),
    (async (): Promise<{row: ResultRow; jev: JevResult | null}> => {
      try {
        const jev = await jevOnce();
        return {
          jev,
          row: {
            ...base,
            arm: 'jev_single',
            verdict: jev.signals.verdictHint.choice,
            ms: jev.ms,
            costUsd: jev.costUsd ?? 0,
            error: false,
            parseFailed: false
          }
        };
      } catch (error) {
        return {
          jev: null,
          row: {
            ...base,
            arm: 'jev_single',
            verdict: 'step_up',
            ms: 0,
            costUsd: 0,
            error: true,
            parseFailed: false,
            note: errorNote(error)
          }
        };
      }
    })(),
    llmArm(base, state, deps.llm)
  ]);

  const calibration: CalibrationRow[] = [];
  if (jevSingle.jev) {
    const s = jevSingle.jev.signals;
    calibration.push({
      signal: 'injected',
      predicted: s.injected,
      actual: c.truth.injected
    });
    if (c.truth.matchesIntent !== null) {
      calibration.push({
        signal: 'matchesIntent',
        predicted: s.matchesIntent,
        actual: c.truth.matchesIntent
      });
    }
  }
  return {rows: [gatehouse, jevSingle.row, llm], calibration};
}
