import type {LoopResult, Step} from './loop';
import type {McpToolResult} from './mcp';
import {isGuardRefusal, isHeld, readToolOutcome} from './outcome';
import type {Found, Scenario} from './scenarios';

export type ScriptDeps = {
  tools: ReadonlySet<string>;
  callTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<McpToolResult>;
  onStep: (step: Step) => Promise<void>;
};

/** Reads document ids from a listDocuments result: {data: [{id, title}]}. */
export function readDocuments(text: string, found: Found) {
  try {
    const parsed = JSON.parse(text) as {data?: unknown};
    if (!Array.isArray(parsed.data)) return;
    for (const item of parsed.data as {id?: unknown; title?: unknown}[]) {
      if (typeof item.id === 'string' && typeof item.title === 'string') {
        found.documents.set(item.title, item.id);
      }
    }
  } catch {
    // Not JSON: nothing to learn.
  }
}

/**
 * Plays the calls a fooled agent makes, through the real MCP path.
 * The guard decides; the script never asks a model.
 */
export async function runScript(
  scenario: Scenario,
  deps: ScriptDeps
): Promise<LoopResult> {
  const found: Found = {documents: new Map()};
  let turns = 0;

  for (const step of scenario.steps) {
    if (step.kind === 'say') {
      await deps.onStep({kind: 'assistant', text: step.text});
      continue;
    }
    turns += 1;
    const args = step.args(found);
    if (!deps.tools.has(step.tool) || args === null) {
      return {
        status: 'failed',
        finalText: `The script could not prepare ${step.tool}.`,
        turns,
        costUsd: 0,
        errorCode: 'script_error'
      };
    }
    const result = await deps.callTool(step.tool, args);
    const outcome = readToolOutcome(result.isError, result.text);
    await deps.onStep({
      kind: 'tool',
      tool: step.tool,
      argsJson: JSON.stringify(args),
      outcome,
      preview: result.text.slice(0, 400)
    });
    if (step.tool === 'listDocuments') readDocuments(result.text, found);

    if (isHeld(outcome)) {
      return {
        status: 'held',
        finalText: 'The guard held this call. It runs only if you approve it.',
        turns,
        costUsd: 0
      };
    }
    if (isGuardRefusal(outcome)) {
      return {
        status: 'refused',
        finalText: `The guard stopped this call (${outcome.code ?? 'refused'}). Nothing ran.`,
        turns,
        costUsd: 0
      };
    }
    if (!outcome.ok) {
      return {
        status: 'failed',
        finalText: `${step.tool} failed with HTTP ${outcome.httpStatus}.`,
        turns,
        costUsd: 0,
        errorCode: outcome.code ?? 'tool_error'
      };
    }
  }
  return {
    status: 'done',
    finalText: 'The guard allowed every call.',
    turns,
    costUsd: 0
  };
}
