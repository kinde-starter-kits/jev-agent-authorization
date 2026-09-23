import type {Operation} from '../api/operations';

export const POLICY_VERSION = '2026-09-23.1';

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

export function decide(operation: Operation, kinde: KindeCheck): Decision {
  if (!kinde.permissionGranted) {
    return {verdict: 'deny', reasonCode: 'kinde_permission_missing'};
  }
  if (kinde.flag !== null && kinde.flagEnabled !== true) {
    return {verdict: 'deny', reasonCode: 'kinde_flag_disabled'};
  }
  if (operation.tier === 'read') {
    return {verdict: 'allow', reasonCode: 'read_allowed_without_judgment'};
  }
  return {verdict: 'deny', reasonCode: 'judgment_unavailable'};
}
