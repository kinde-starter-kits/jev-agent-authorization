import {describe, expect, test} from 'vitest';
import {operationById, type Operation} from '../api/operations';
import {checkKinde, decide} from './policy';
import type {KindeClaims} from './token';

function claims(
  permissions: string[],
  featureFlags: Record<string, boolean> = {}
): KindeClaims {
  return {
    sub: 'kp_user_a',
    azp: null,
    orgCode: null,
    permissions,
    featureFlags,
    authTime: null,
    expiresAt: 0
  };
}

function op(id: string): Operation {
  const operation = operationById(id);
  if (!operation) throw new Error(id);
  return operation;
}

describe('decide', () => {
  test('denies when the Kinde permission is missing', () => {
    const operation = op('listProjects');
    expect(decide(operation, checkKinde(operation, claims([])))).toEqual({
      verdict: 'deny',
      reasonCode: 'kinde_permission_missing'
    });
  });

  test('denies when a required feature flag is off', () => {
    const operation = op('exportCustomers');
    const kinde = checkKinde(operation, claims(['gatehouse:customers:export']));
    expect(decide(operation, kinde).reasonCode).toBe('kinde_flag_disabled');
  });

  test('allows a permitted read', () => {
    const operation = op('listProjects');
    const kinde = checkKinde(operation, claims(['gatehouse:projects:read']));
    expect(decide(operation, kinde).verdict).toBe('allow');
  });

  test('refuses every non-read tier until judgment is available', () => {
    for (const id of [
      'archiveProject',
      'deleteProject',
      'issueRefund',
      'inviteMember'
    ]) {
      const operation = op(id);
      const kinde = checkKinde(operation, claims([operation.permission]));
      expect(decide(operation, kinde), id).toEqual({
        verdict: 'deny',
        reasonCode: 'judgment_unavailable'
      });
    }
  });
});
