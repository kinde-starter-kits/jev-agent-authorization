import {describe, expect, test, vi} from 'vitest';
import type {Llm, LlmReply} from './llm';
import {MAX_TURNS, runLoop, type Step} from './loop';
import type {McpTool} from './mcp';

const tools: McpTool[] = [
  {name: 'listProjects', inputSchema: {type: 'object', properties: {}}},
  {
    name: 'deleteProject',
    inputSchema: {type: 'object', properties: {slug: {type: 'string'}}}
  }
];

function scriptedLlm(replies: LlmReply[]): Llm & {calls: number} {
  const llm = vi.fn(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error('no more replies');
    return reply;
  }) as unknown as Llm & {calls: number};
  return llm;
}

const call = (name: string, args: object = {}, id = name) => ({
  text: null,
  toolCalls: [{id, name, argumentsJson: JSON.stringify(args)}],
  costUsd: 0.01
});

const say = (text: string) => ({text, toolCalls: [], costUsd: 0.01});

function harness(results: Record<string, {isError: boolean; text: string}>) {
  const steps: Step[] = [];
  const callTool = vi.fn(
    async (name: string) => results[name] ?? {isError: false, text: '{}'}
  );
  return {steps, callTool, onStep: async (step: Step) => void steps.push(step)};
}

describe('runLoop', () => {
  test('runs an allowed tool and finishes with the final answer', async () => {
    const h = harness({
      listProjects: {
        isError: false,
        text: '{"data":[],"decision":{"id":"d1","verdict":"allow"}}'
      }
    });
    const llm = scriptedLlm([
      call('listProjects'),
      say('You have no projects.')
    ]);
    const result = await runLoop('list my projects', {llm, tools, ...h});
    expect(result).toMatchObject({
      status: 'done',
      finalText: 'You have no projects.',
      turns: 2
    });
    expect(result.costUsd).toBeCloseTo(0.02);
    expect(h.steps[0]).toMatchObject({
      kind: 'tool',
      tool: 'listProjects',
      outcome: {ok: true, verdict: 'allow', decisionId: 'd1'}
    });
  });

  test('stops at a held call and never asks the model again', async () => {
    const held = `Upstream error 403: ${JSON.stringify({
      error: {code: 'high_impact_operation'},
      decision: {id: 'd2', verdict: 'step_up'},
      approval: {id: 'h1', url: 'http://localhost:3000/approve/h1'}
    })}`;
    const h = harness({deleteProject: {isError: true, text: held}});
    const llm = scriptedLlm([
      call('deleteProject', {slug: 'acme'}),
      say('should not happen')
    ]);
    const result = await runLoop('delete acme', {llm, tools, ...h});
    expect(result.status).toBe('held');
    expect(llm).toHaveBeenCalledTimes(1);
    expect(h.steps[0]).toMatchObject({
      outcome: {approval: {id: 'h1'}, verdict: 'step_up'}
    });
  });

  test('stops at a guard refusal', async () => {
    const denied = `Upstream error 403: ${JSON.stringify({error: {code: 'jev_injection'}, decision: {id: 'd3'}})}`;
    const h = harness({deleteProject: {isError: true, text: denied}});
    const llm = scriptedLlm([
      call('deleteProject', {slug: 'acme'}),
      say('should not happen')
    ]);
    const result = await runLoop('do it', {llm, tools, ...h});
    expect(result.status).toBe('refused');
    expect(result.finalText).toContain('jev_injection');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  test('lets the model recover from an ordinary error', async () => {
    const h = harness({
      deleteProject: {
        isError: true,
        text: 'Upstream error 404: {"error":{"code":"not_found"}}'
      }
    });
    const llm = scriptedLlm([
      call('deleteProject', {slug: 'nope'}),
      say('That project does not exist.')
    ]);
    const result = await runLoop('delete nope', {llm, tools, ...h});
    expect(result).toMatchObject({
      status: 'done',
      finalText: 'That project does not exist.'
    });
  });

  test('refuses tools it was not given and bad arguments', async () => {
    const h = harness({});
    const llm = scriptedLlm([
      {
        text: null,
        toolCalls: [{id: 'x', name: 'dropDatabase', argumentsJson: '{}'}],
        costUsd: 0
      },
      {
        text: null,
        toolCalls: [{id: 'y', name: 'listProjects', argumentsJson: 'not json'}],
        costUsd: 0
      },
      say('done')
    ]);
    await runLoop('go', {llm, tools, ...h});
    expect(h.callTool).not.toHaveBeenCalled();
  });

  test('stops after the turn limit', async () => {
    const h = harness({listProjects: {isError: false, text: '{}'}});
    const llm = scriptedLlm(
      Array.from({length: MAX_TURNS + 2}, () => call('listProjects'))
    );
    const result = await runLoop('loop', {llm, tools, ...h});
    expect(result).toMatchObject({
      status: 'failed',
      errorCode: 'max_turns',
      turns: MAX_TURNS
    });
  });
});
