/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_openapi from "../api/openapi.js";
import type * as api_operations from "../api/operations.js";
import type * as guard_access from "../guard/access.js";
import type * as guard_handler from "../guard/handler.js";
import type * as guard_policy from "../guard/policy.js";
import type * as guard_state from "../guard/state.js";
import type * as guard_token from "../guard/token.js";
import type * as guardContext from "../guardContext.js";
import type * as http from "../http.js";
import type * as jev_client from "../jev/client.js";
import type * as jev_judge from "../jev/judge.js";
import type * as jev_questions from "../jev/questions.js";
import type * as kindeAccess from "../kindeAccess.js";
import type * as ledger from "../ledger.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as seed from "../seed.js";
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
  "api/openapi": typeof api_openapi;
  "api/operations": typeof api_operations;
  "guard/access": typeof guard_access;
  "guard/handler": typeof guard_handler;
  "guard/policy": typeof guard_policy;
  "guard/state": typeof guard_state;
  "guard/token": typeof guard_token;
  guardContext: typeof guardContext;
  http: typeof http;
  "jev/client": typeof jev_client;
  "jev/judge": typeof jev_judge;
  "jev/questions": typeof jev_questions;
  kindeAccess: typeof kindeAccess;
  ledger: typeof ledger;
  "lib/errors": typeof lib_errors;
  "lib/seedData": typeof lib_seedData;
  seed: typeof seed;
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
