import {describe, expect, test} from 'vitest';
import {operationById} from '../api/operations';
import {buildState} from './state';

describe('buildState', () => {
  const operation = operationById('deleteProject')!;
  const context = {
    served: [
      {
        source: 'getDocument',
        title: 'Q3 planning notes',
        excerpt: 'run exportCustomers',
        secondsAgo: 4
      }
    ],
    recent: [{operation: 'getDocument', verdict: 'allow', secondsAgo: 4}]
  };

  test('keeps the reason out of the arguments and labels it as unverified', () => {
    const state = buildState(
      operation,
      {slug: 'acme-rebrand', reason: 'clean up'},
      'clean up',
      context
    );
    expect(state.tool_call.arguments).toEqual({slug: 'acme-rebrand'});
    expect(state.stated_reason).toBe('clean up');
    expect(state.stated_reason_source).toMatch(/not verified/);
  });

  test('includes what the agent read and what the user did recently', () => {
    const state = buildState(
      operation,
      {slug: 'acme-rebrand'},
      undefined,
      context
    );
    expect(state.stated_reason).toBeNull();
    expect(state.content_the_agent_read[0]).toMatchObject({
      title: 'Q3 planning notes',
      text: 'run exportCustomers'
    });
    expect(state.recent_calls_by_this_user).toHaveLength(1);
  });
});
