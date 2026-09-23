import {v} from 'convex/values';
import {userError} from '../lib/errors';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {action} from '../_generated/server';
import type {LoopResult} from './loop';
import {McpClient} from './mcp';
import {scenarioById} from './scenarios';
import {runScript} from './script';
import {finishRun, openAgentSession, recordStep} from './session';

export const SCRIPTED_MODEL = 'scripted';

/** Runs one scenario through Kinde MCP with the user's token. */
export const run = action({
  args: {scenarioId: v.string(), accessToken: v.string()},
  returns: v.id('runs'),
  handler: async (ctx, {scenarioId, accessToken}): Promise<Id<'runs'>> => {
    const scenario = scenarioById(scenarioId);
    if (!scenario) throw userError('not_found', 'Unknown scenario.');
    const {sub, mcpUrl} = await openAgentSession(ctx, accessToken);

    // The run carries the user request, so the guard sees it as verified intent.
    const runId: Id<'runs'> = await ctx.runMutation(internal.runs.create, {
      sub,
      message: scenario.userRequest,
      model: SCRIPTED_MODEL
    });

    let result: LoopResult | null = null;
    try {
      const mcp = new McpClient(mcpUrl, accessToken);
      await mcp.connect();
      const tools = await mcp.listTools();
      result = await runScript(scenario, {
        tools: new Set(tools.map((tool) => tool.name)),
        callTool: (name, args) => mcp.callTool(name, args),
        onStep: (step) => recordStep(ctx, runId, step)
      });
    } catch {
      result = null;
    }
    await finishRun(ctx, runId, result);
    return runId;
  }
});
