import {v} from 'convex/values';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {action, env} from '../_generated/server';
import {remoteJwks, verifyKindeToken} from '../guard/token';
import {DEFAULT_AGENT_MODEL, openRouterLlm} from './llm';
import {runLoop} from './loop';
import {McpClient} from './mcp';

const MAX_MESSAGE = 1000;

export const start = action({
  args: {message: v.string(), accessToken: v.string()},
  returns: v.union(v.null(), v.id('runs')),
  handler: async (ctx, {message, accessToken}): Promise<Id<'runs'> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to run the agent.');
    const text = message.trim();
    if (text.length === 0 || text.length > MAX_MESSAGE) {
      throw new Error(`Write a request of 1 to ${MAX_MESSAGE} characters.`);
    }

    const issuer = env.KINDE_ISSUER_URL;
    const audience = env.GATEHOUSE_AUDIENCE;
    const mcpUrl = env.GATEHOUSE_MCP_URL;
    const apiKey = env.OPENROUTER_API_KEY;
    if (!issuer || !audience || !mcpUrl || !apiKey)
      throw new Error('The agent is not configured.');

    const token = await verifyKindeToken(accessToken, {
      issuer,
      audience,
      jwks: remoteJwks(issuer)
    });
    if (!token.ok || token.claims.sub !== identity.subject) {
      throw new Error(
        'The access token does not belong to the signed-in user.'
      );
    }

    const model = env.AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
    const runId: Id<'runs'> = await ctx.runMutation(internal.runs.create, {
      sub: identity.subject,
      message: text,
      model
    });

    try {
      const mcp = new McpClient(mcpUrl, accessToken);
      await mcp.connect();
      const tools = await mcp.listTools();
      const result = await runLoop(text, {
        llm: openRouterLlm({apiKey, model}),
        tools,
        callTool: (name, args) => mcp.callTool(name, args),
        onStep: async (step) => {
          if (step.kind === 'assistant') {
            await ctx.runMutation(internal.runs.addStep, {
              runId,
              kind: 'assistant',
              text: step.text
            });
            return;
          }
          await ctx.runMutation(internal.runs.addStep, {
            runId,
            kind: 'tool',
            tool: step.tool,
            argsJson: step.argsJson,
            ok: step.outcome.ok,
            httpStatus: step.outcome.httpStatus,
            code: step.outcome.code ?? undefined,
            decisionId: step.outcome.decisionId ?? undefined,
            heldCallId: step.outcome.approval?.id,
            approvalUrl: step.outcome.approval?.url ?? undefined,
            resultPreview: step.preview
          });
        }
      });
      await ctx.runMutation(internal.runs.finish, {runId, ...result});
    } catch {
      await ctx.runMutation(internal.runs.finish, {
        runId,
        status: 'failed',
        finalText: 'The agent could not finish this run.',
        turns: 0,
        costUsd: 0,
        errorCode: 'agent_error'
      });
    }
    return runId;
  }
});
