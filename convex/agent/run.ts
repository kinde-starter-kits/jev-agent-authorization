import {v} from 'convex/values';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {action, env} from '../_generated/server';
import {DEFAULT_AGENT_MODEL, openRouterLlm} from './llm';
import {runLoop, type LoopResult} from './loop';
import {McpClient} from './mcp';
import {finishRun, MAX_MESSAGE, openAgentSession, recordStep} from './session';

export const start = action({
  args: {message: v.string(), accessToken: v.string()},
  returns: v.union(v.null(), v.id('runs')),
  handler: async (ctx, {message, accessToken}): Promise<Id<'runs'> | null> => {
    const {sub, mcpUrl} = await openAgentSession(ctx, accessToken);
    const text = message.trim();
    if (text.length === 0 || text.length > MAX_MESSAGE) {
      throw new Error(`Write a request of 1 to ${MAX_MESSAGE} characters.`);
    }
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('The agent is not configured.');

    const model = env.AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
    const runId: Id<'runs'> = await ctx.runMutation(internal.runs.create, {
      sub,
      message: text,
      model
    });

    let result: LoopResult | null = null;
    try {
      const mcp = new McpClient(mcpUrl, accessToken);
      await mcp.connect();
      const tools = await mcp.listTools();
      result = await runLoop(text, {
        llm: openRouterLlm({apiKey, model}),
        tools,
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
