/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_llm from "../agent/llm.js";
import type * as agent_loop from "../agent/loop.js";
import type * as agent_mcp from "../agent/mcp.js";
import type * as agent_outcome from "../agent/outcome.js";
import type * as agent_playground from "../agent/playground.js";
import type * as agent_run from "../agent/run.js";
import type * as agent_scenarios from "../agent/scenarios.js";
import type * as agent_script from "../agent/script.js";
import type * as agent_session from "../agent/session.js";
import type * as api_openapi from "../api/openapi.js";
import type * as api_operations from "../api/operations.js";
import type * as bench_arms from "../bench/arms.js";
import type * as bench_cases from "../bench/cases.js";
import type * as bench_llmJudge from "../bench/llmJudge.js";
import type * as bench_metrics from "../bench/metrics.js";
import type * as bench_results from "../bench/results.js";
import type * as bench_runner from "../bench/runner.js";
import type * as crons from "../crons.js";
import type * as guard_access from "../guard/access.js";
import type * as guard_approvals from "../guard/approvals.js";
import type * as guard_handler from "../guard/handler.js";
import type * as guard_judgment from "../guard/judgment.js";
import type * as guard_policy from "../guard/policy.js";
import type * as guard_state from "../guard/state.js";
import type * as guard_token from "../guard/token.js";
import type * as guardContext from "../guardContext.js";
import type * as held from "../held.js";
import type * as http from "../http.js";
import type * as jev_client from "../jev/client.js";
import type * as jev_judge from "../jev/judge.js";
import type * as jev_questions from "../jev/questions.js";
import type * as kindeAccess from "../kindeAccess.js";
import type * as ledger from "../ledger.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_redact from "../lib/redact.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_stats from "../lib/stats.js";
import type * as rateLimit from "../rateLimit.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as wall from "../wall.js";
import type * as workspace_customers from "../workspace/customers.js";
import type * as workspace_documents from "../workspace/documents.js";
import type * as workspace_invoices from "../workspace/invoices.js";
import type * as workspace_members from "../workspace/members.js";
import type * as workspace_projects from "../workspace/projects.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/llm": typeof agent_llm;
  "agent/loop": typeof agent_loop;
  "agent/mcp": typeof agent_mcp;
  "agent/outcome": typeof agent_outcome;
  "agent/playground": typeof agent_playground;
  "agent/run": typeof agent_run;
  "agent/scenarios": typeof agent_scenarios;
  "agent/script": typeof agent_script;
  "agent/session": typeof agent_session;
  "api/openapi": typeof api_openapi;
  "api/operations": typeof api_operations;
  "bench/arms": typeof bench_arms;
  "bench/cases": typeof bench_cases;
  "bench/llmJudge": typeof bench_llmJudge;
  "bench/metrics": typeof bench_metrics;
  "bench/results": typeof bench_results;
  "bench/runner": typeof bench_runner;
  crons: typeof crons;
  "guard/access": typeof guard_access;
  "guard/approvals": typeof guard_approvals;
  "guard/handler": typeof guard_handler;
  "guard/judgment": typeof guard_judgment;
  "guard/policy": typeof guard_policy;
  "guard/state": typeof guard_state;
  "guard/token": typeof guard_token;
  guardContext: typeof guardContext;
  held: typeof held;
  http: typeof http;
  "jev/client": typeof jev_client;
  "jev/judge": typeof jev_judge;
  "jev/questions": typeof jev_questions;
  kindeAccess: typeof kindeAccess;
  ledger: typeof ledger;
  "lib/errors": typeof lib_errors;
  "lib/redact": typeof lib_redact;
  "lib/seedData": typeof lib_seedData;
  "lib/stats": typeof lib_stats;
  rateLimit: typeof rateLimit;
  runs: typeof runs;
  seed: typeof seed;
  wall: typeof wall;
  "workspace/customers": typeof workspace_customers;
  "workspace/documents": typeof workspace_documents;
  "workspace/invoices": typeof workspace_invoices;
  "workspace/members": typeof workspace_members;
  "workspace/projects": typeof workspace_projects;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
