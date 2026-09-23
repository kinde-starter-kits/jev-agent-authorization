import {describe, expect, test} from 'vitest';
import {operationById, type Operation} from '../api/operations';
import {jevAnswers, type AnswerInput} from '../jev/answers.testing';
import {parseSignals} from '../jev/client';
import {checkKinde, decideKinde, decideWithSignals} from './policy';

function op(id: string): Operation {
  const operation = operationById(id);
  if (!operation) throw new Error(id);
  return operation;
}

function entitlements(
  permissions: string[],
  featureFlags: Record<string, boolean> = {}
) {
  return {permissions, featureFlags};
}

function signals(input: AnswerInput = {}) {
  return parseSignals(jevAnswers(input));
}

describe('decideKinde', () => {
  test('denies when the Kinde permission is missing', () => {
    const operation = op('listProjects');
    expect(
      decideKinde(operation, checkKinde(operation, entitlements([])))
    ).toEqual({
      verdict: 'deny',
      reasonCode: 'kinde_permission_missing'
    });
  });

  test('denies when a required feature flag is off', () => {
    const operation = op('exportCustomers');
    const kinde = checkKinde(
      operation,
      entitlements(['gatehouse:customers:export'])
    );
    expect(decideKinde(operation, kinde)?.reasonCode).toBe(
      'kinde_flag_disabled'
    );
  });

  test('allows a permitted read without judgment', () => {
    const operation = op('listProjects');
    const kinde = checkKinde(
      operation,
      entitlements(['gatehouse:projects:read'])
    );
    expect(decideKinde(operation, kinde)?.verdict).toBe('allow');
  });

  test('sends a permitted write on to judgment', () => {
    const operation = op('archiveProject');
    const kinde = checkKinde(
      operation,
      entitlements(['gatehouse:projects:write'])
    );
    expect(decideKinde(operation, kinde)).toBeNull();
  });
});

describe('decideWithSignals', () => {
  const archive = op('archiveProject');

  test('allows a clear, low-risk write the user asked for', () => {
    expect(decideWithSignals(archive, signals(), true)).toEqual({
      verdict: 'allow',
      reasonCode: 'jev_allow'
    });
  });

  test('denies an injected call before anything else', () => {
    expect(
      decideWithSignals(op('deleteProject'), signals({injected: 0.97}), true)
    ).toEqual({
      verdict: 'deny',
      reasonCode: 'jev_injection'
    });
  });

  test('denies exfiltration with no stated reason', () => {
    expect(
      decideWithSignals(archive, signals({exfiltration: 0.9}), false).valueOf()
    ).toMatchObject({
      reasonCode: 'jev_exfiltration'
    });
  });

  test.each([
    'deleteProject',
    'issueRefund',
    'inviteMember',
    'removeMember',
    'exportCustomers'
  ])('steps up %s even when every signal is calm', (id) => {
    expect(decideWithSignals(op(id), signals(), true)).toEqual({
      verdict: 'step_up',
      reasonCode: 'high_impact_operation'
    });
  });

  test('steps up a destructive-looking write', () => {
    expect(
      decideWithSignals(archive, signals({destructive: 0.85}), true)
    ).toMatchObject({reasonCode: 'jev_destructive'});
  });

  test('steps up high risk', () => {
    expect(decideWithSignals(archive, signals({risk: 2}), true)).toMatchObject({
      reasonCode: 'jev_high_risk'
    });
  });

  test('steps up when intent is unclear or missing', () => {
    expect(
      decideWithSignals(archive, signals({matches: 0.4}), true)
    ).toMatchObject({reasonCode: 'jev_intent_unclear'});
    expect(decideWithSignals(archive, signals(), false)).toMatchObject({
      reasonCode: 'jev_intent_unclear'
    });
  });

  test('sends a low-confidence call to the judge', () => {
    expect(
      decideWithSignals(archive, signals({riskConfidence: 0.45}), true)
    ).toEqual({cascade: true});
  });

  test('ignores the single verdict hint', () => {
    expect(
      decideWithSignals(archive, signals({hint: 'deny'}), true)
    ).toMatchObject({verdict: 'allow'});
  });
});
