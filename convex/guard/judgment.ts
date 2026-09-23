import type {Operation} from '../api/operations';
import type {JevResult} from '../jev/client';
import type {JudgeResult} from '../jev/judge';
import {decideWithSignals, type Decision} from './policy';

export type Judgment = {
  decision: Decision;
  jev?: JevResult;
  judge?: JudgeResult;
};

/**
 * Jev -> policy -> optional LLM judge, for one call that Kinde already
 * permitted. The guard and the benchmark both run this, so they cannot drift.
 */
export async function judgeWithJev(
  operation: Operation,
  reasonStated: boolean,
  deps: {
    jev: () => Promise<JevResult>;
    /** null when no judge model is configured. */
    judge: (() => Promise<JudgeResult>) | null;
  }
): Promise<Judgment> {
  let jev: JevResult;
  try {
    jev = await deps.jev();
  } catch {
    return {decision: {verdict: 'step_up', reasonCode: 'jev_unavailable'}};
  }

  const result = decideWithSignals(operation, jev.signals, reasonStated);
  if (!('cascade' in result)) return {decision: result, jev};

  if (!deps.judge) {
    return {
      decision: {verdict: 'step_up', reasonCode: 'judge_not_configured'},
      jev
    };
  }
  try {
    const judge = await deps.judge();
    return {
      decision: {
        verdict: judge.verdict,
        reasonCode: judge.verdict === 'allow' ? 'judge_allow' : 'judge_step_up'
      },
      jev,
      judge
    };
  } catch {
    return {
      decision: {verdict: 'step_up', reasonCode: 'judge_unavailable'},
      jev
    };
  }
}
