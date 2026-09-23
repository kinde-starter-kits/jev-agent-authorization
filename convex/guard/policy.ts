import type {Operation, Tier} from '../api/operations';
import type {JevSignals} from '../jev/questions';

export const POLICY_VERSION = '2026-09-23.2';

export type Verdict = 'allow' | 'step_up' | 'deny';

export type KindeCheck = {
  permission: string;
  permissionGranted: boolean;
  flag: string | null;
  flagEnabled: boolean | null;
};

export type Decision = {verdict: Verdict; reasonCode: string};

export type Entitlements = {
  permissions: string[];
  featureFlags: Record<string, boolean>;
};

export function checkKinde(
  operation: Operation,
  claims: Entitlements
): KindeCheck {
  const flag = operation.flag ?? null;
  return {
    permission: operation.permission,
    permissionGranted: claims.permissions.includes(operation.permission),
    flag,
    flagEnabled: flag === null ? null : claims.featureFlags[flag] === true
  };
}

export const THRESHOLDS = {
  injected: 0.8,
  exfiltration: 0.8,
  destructive: 0.8,
  risk: 2,
  matchesIntent: 0.5,
  riskConfidence: 0.6
} as const;

const HIGH_IMPACT: readonly Tier[] = [
  'destructive',
  'money',
  'access',
  'exfil'
];

export function decideKinde(
  operation: Operation,
  kinde: KindeCheck
): Decision | null {
  if (!kinde.permissionGranted) {
    return {verdict: 'deny', reasonCode: 'kinde_permission_missing'};
  }
  if (kinde.flag !== null && kinde.flagEnabled !== true) {
    return {verdict: 'deny', reasonCode: 'kinde_flag_disabled'};
  }
  if (operation.tier === 'read') {
    return {verdict: 'allow', reasonCode: 'read_allowed_without_judgment'};
  }
  return null;
}

export type SignalDecision = Decision | {cascade: true};

export function decideWithSignals(
  operation: Operation,
  signals: JevSignals,
  reasonStated: boolean
): SignalDecision {
  if (signals.injected >= THRESHOLDS.injected) {
    return {verdict: 'deny', reasonCode: 'jev_injection'};
  }
  if (signals.exfiltration >= THRESHOLDS.exfiltration && !reasonStated) {
    return {verdict: 'deny', reasonCode: 'jev_exfiltration'};
  }
  if (HIGH_IMPACT.includes(operation.tier)) {
    return {verdict: 'step_up', reasonCode: 'high_impact_operation'};
  }
  if (signals.destructive >= THRESHOLDS.destructive) {
    return {verdict: 'step_up', reasonCode: 'jev_destructive'};
  }
  if (signals.risk >= THRESHOLDS.risk) {
    return {verdict: 'step_up', reasonCode: 'jev_high_risk'};
  }
  if (!reasonStated || signals.matchesIntent < THRESHOLDS.matchesIntent) {
    return {verdict: 'step_up', reasonCode: 'jev_intent_unclear'};
  }
  if (signals.riskConfidence < THRESHOLDS.riskConfidence) {
    return {cascade: true};
  }
  return {verdict: 'allow', reasonCode: 'jev_allow'};
}
