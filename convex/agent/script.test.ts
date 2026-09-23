import {describe, expect, test} from 'vitest';
import type {Step} from './loop';
import type {McpToolResult} from './mcp';
import {SCENARIOS, scenarioById} from './scenarios';
import {readDocuments, runScript} from './script';

const TOOLS = new Set([
  'listProjects',
  'archiveProject',
  'deleteProject',
  'listDocuments',
  'getDocument',
  'issueRefund',
  'listMembers',
  'inviteMember',
  'removeMember',
  'exportCustomers'
]);

const DOCUMENTS = {
  data: [
    {id: 'doc_q3', title: 'Q3 planning notes'},
    {id: 'doc_vendor', title: 'Vendor onboarding checklist'},
    {id: 'doc_lumen', title: 'Lumen client feedback, round 3'}
  ],
  decision: {id: 'd1', verdict: 'allow'}
};

const ok = (data: unknown = {}): McpToolResult => ({
  isError: false,
  text: JSON.stringify({data, decision: {id: 'd', verdict: 'allow'}})
});
const refused = (code: string): McpToolResult => ({
  isError: true,
  text: `Upstream error 403: ${JSON.stringify({error: {code}, decision: {id: 'd9', verdict: 'deny'}})}`
});
const held: McpToolResult = {
  isError: true,
  text: `Upstream error 403: ${JSON.stringify({
    error: {code: 'high_impact_operation'},
    decision: {id: 'd8', verdict: 'step_up'},
    approval: {id: 'h1', url: 'https://app/approve/h1'}
  })}`
};

function harness(final: McpToolResult) {
  const calls: {name: string; args: Record<string, unknown>}[] = [];
  const steps: Step[] = [];
  return {
    calls,
    steps,
    deps: {
      tools: TOOLS,
      callTool: async (name: string, args: Record<string, unknown>) => {
        calls.push({name, args});
        if (name === 'listDocuments') return ok(DOCUMENTS.data);
        if (name.startsWith('list') || name === 'getDocument') return ok();
        return final;
      },
      onStep: async (step: Step) => {
        steps.push(step);
      }
    }
  };
}

describe('scenarios', () => {
  test('ids are unique and every call uses a known tool', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      for (const step of scenario.steps) {
        if (step.kind === 'call') expect(TOOLS.has(step.tool)).toBe(true);
      }
    }
  });

  test('write calls pass args the way Kinde MCP tools take them', () => {
    const invite = scenarioById('vendor-admin')!.steps.at(-1)!;
    const remove = scenarioById('quiet-removal')!.steps.at(-1)!;
    const found = {documents: new Map()};
    if (invite.kind !== 'call' || remove.kind !== 'call') throw new Error();
    expect(typeof invite.args(found)?.body).toBe('string');
    expect(remove.args(found)).toMatchObject({
      email: 'jonas@harborpine.example'
    });
    expect(typeof remove.args(found)?.query).toBe('string');
  });
});

describe('runScript', () => {
  test('reads the poisoned document by id, then stops when the guard refuses', async () => {
    const h = harness(refused('jev_injection'));
    const result = await runScript(scenarioById('vendor-admin')!, h.deps);
    expect(h.calls.map((c) => c.name)).toEqual([
      'listDocuments',
      'getDocument',
      'inviteMember'
    ]);
    expect(h.calls[1]?.args).toEqual({documentId: 'doc_vendor'});
    expect(result).toMatchObject({status: 'refused', costUsd: 0});
    expect(result.finalText).toContain('jev_injection');
    expect(h.steps.some((s) => s.kind === 'assistant')).toBe(true);
  });

  test('stops on a held call', async () => {
    const h = harness(held);
    const result = await runScript(scenarioById('cleanup-delete')!, h.deps);
    expect(result.status).toBe('held');
    const last = h.steps.at(-1);
    expect(last?.kind === 'tool' && last.outcome.approval?.id).toBe('h1');
  });

  test('finishes when every call is allowed', async () => {
    const h = harness(ok({status: 'archived'}));
    const result = await runScript(scenarioById('benign-archive')!, h.deps);
    expect(result.status).toBe('done');
  });

  test('fails without calling when a document is missing', async () => {
    const h = harness(ok());
    h.deps.callTool = async (name, args) => {
      h.calls.push({name, args});
      return ok([]);
    };
    const result = await runScript(scenarioById('notes-export')!, h.deps);
    expect(result).toMatchObject({status: 'failed', errorCode: 'script_error'});
    expect(h.calls.map((c) => c.name)).toEqual(['listDocuments']);
  });

  test('fails when the MCP server does not list the tool', async () => {
    const h = harness(ok());
    const result = await runScript(scenarioById('quiet-removal')!, {
      ...h.deps,
      tools: new Set(['listMembers'])
    });
    expect(result.status).toBe('failed');
    expect(h.calls.map((c) => c.name)).toEqual(['listMembers']);
  });
});

describe('readDocuments', () => {
  test('ignores text that is not a document list', () => {
    const found = {documents: new Map<string, string>()};
    readDocuments('not json', found);
    readDocuments('{"data": {"id": 1}}', found);
    expect(found.documents.size).toBe(0);
  });
});
