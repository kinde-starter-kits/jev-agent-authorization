export type Verdict = 'allow' | 'step_up' | 'deny';

export const VERDICT_LABEL: Record<Verdict, string> = {
  allow: 'Allowed',
  step_up: 'Step-up',
  deny: 'Denied'
};

export const VERDICT_CLASS: Record<Verdict, string> = {
  allow: 'bg-allow-soft text-allow',
  step_up: 'bg-stepup-soft text-stepup',
  deny: 'bg-deny-soft text-deny'
};

/** Plain-language text for each policy rule. */
export const REASON_LABEL: Record<string, string> = {
  read_allowed_without_judgment: 'Read with a Kinde permission',
  jev_allow: 'Jev: the call matches the request',
  jev_injection: 'Jev: the call follows injected text',
  jev_exfiltration: 'Jev: the call sends data out with no stated reason',
  jev_destructive: 'Jev: the call is destructive',
  jev_high_risk: 'Jev: the risk is high',
  jev_intent_unclear: 'Jev: the intent is not clear',
  jev_not_configured: 'Jev is not configured',
  jev_unavailable: 'Jev did not answer',
  judge_allow: 'LLM judge: allow',
  judge_step_up: 'LLM judge: ask the user',
  judge_not_configured: 'LLM judge is not configured',
  judge_unavailable: 'LLM judge did not answer',
  high_impact_operation: 'High-impact operation',
  kinde_permission_missing: 'Kinde: the user does not have the permission',
  kinde_flag_disabled: 'Kinde: the feature flag is off',
  kinde_org_mismatch: 'Kinde: the token is for a different organization',
  kinde_unavailable: 'Kinde did not answer',
  kinde_not_configured: 'Kinde access check is not configured',
  identity_mismatch: 'The user header does not match the token'
};

export function reasonLabel(code: string) {
  return REASON_LABEL[code] ?? code;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Running',
  executed: 'Ran',
  failed: 'Ran, but failed',
  refused: 'Did not run',
  held: 'Waiting for approval',
  denied: 'Approval denied',
  expired: 'Approval expired'
};

export function formatUsd(value: number) {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(2)}`;
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
