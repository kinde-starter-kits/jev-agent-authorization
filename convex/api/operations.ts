import type {FunctionReference} from 'convex/server';
import {internal} from '../_generated/api';

export type Tier =
  'read' | 'write' | 'money' | 'access' | 'destructive' | 'exfil';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type JsonSchema = Record<string, unknown>;

type Runner =
  | {kind: 'query'; ref: FunctionReference<'query', 'internal'>}
  | {kind: 'mutation'; ref: FunctionReference<'mutation', 'internal'>};

export type Operation = {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  permission: string;
  flag?: string;
  tier: Tier;
  pathParams: readonly string[];
  body?: {required: readonly string[]; properties: Record<string, JsonSchema>};
  run: Runner;
};

export const REASON_DESCRIPTION =
  "The user's request that led to this call, in their words. The guard treats a missing reason as no stated intent.";

const reason: JsonSchema = {type: 'string', description: REASON_DESCRIPTION};

export const operations: readonly Operation[] = [
  {
    operationId: 'listProjects',
    method: 'GET',
    path: '/api/v1/projects',
    summary: 'List projects',
    description:
      'Lists every project in the workspace with its client and status.',
    permission: 'gatehouse:projects:read',
    tier: 'read',
    pathParams: [],
    run: {kind: 'query', ref: internal.workspace.projects.listProjects}
  },
  {
    operationId: 'getProject',
    method: 'GET',
    path: '/api/v1/projects/{slug}',
    summary: 'Get a project',
    description: 'Gets one project with its documents and invoices.',
    permission: 'gatehouse:projects:read',
    tier: 'read',
    pathParams: ['slug'],
    run: {kind: 'query', ref: internal.workspace.projects.getProject}
  },
  {
    operationId: 'archiveProject',
    method: 'POST',
    path: '/api/v1/projects/{slug}/archive',
    summary: 'Archive a project',
    description:
      'Marks a project as archived. Archiving keeps all data and can be undone.',
    permission: 'gatehouse:projects:write',
    tier: 'write',
    pathParams: ['slug'],
    body: {required: [], properties: {reason}},
    run: {kind: 'mutation', ref: internal.workspace.projects.archiveProject}
  },
  {
    operationId: 'deleteProject',
    method: 'DELETE',
    path: '/api/v1/projects/{slug}',
    summary: 'Delete a project',
    description:
      'Deletes a project and all its documents, invoices and refunds. This cannot be undone.',
    permission: 'gatehouse:projects:delete',
    tier: 'destructive',
    pathParams: ['slug'],
    run: {kind: 'mutation', ref: internal.workspace.projects.deleteProject}
  },
  {
    operationId: 'listDocuments',
    method: 'GET',
    path: '/api/v1/documents',
    summary: 'List documents',
    description:
      'Lists document ids, titles and projects. Use getDocument to read a body.',
    permission: 'gatehouse:docs:read',
    tier: 'read',
    pathParams: [],
    run: {kind: 'query', ref: internal.workspace.documents.listDocuments}
  },
  {
    operationId: 'getDocument',
    method: 'GET',
    path: '/api/v1/documents/{documentId}',
    summary: 'Read a document',
    description: 'Returns the full title and body of one document.',
    permission: 'gatehouse:docs:read',
    tier: 'read',
    pathParams: ['documentId'],
    run: {kind: 'query', ref: internal.workspace.documents.getDocument}
  },
  {
    operationId: 'createDocument',
    method: 'POST',
    path: '/api/v1/documents',
    summary: 'Create a document',
    description: 'Creates a document, optionally inside a project.',
    permission: 'gatehouse:docs:write',
    tier: 'write',
    pathParams: [],
    body: {
      required: ['title', 'body'],
      properties: {
        title: {type: 'string', minLength: 1, maxLength: 200},
        body: {type: 'string', maxLength: 20000},
        projectSlug: {type: 'string'},
        reason
      }
    },
    run: {kind: 'mutation', ref: internal.workspace.documents.createDocument}
  },
  {
    operationId: 'updateDocument',
    method: 'PUT',
    path: '/api/v1/documents/{documentId}',
    summary: 'Replace a document body',
    description: 'Replaces the body of one document. The old body is not kept.',
    permission: 'gatehouse:docs:write',
    tier: 'write',
    pathParams: ['documentId'],
    body: {
      required: ['body'],
      properties: {body: {type: 'string', maxLength: 20000}, reason}
    },
    run: {kind: 'mutation', ref: internal.workspace.documents.updateDocument}
  },
  {
    operationId: 'listInvoices',
    method: 'GET',
    path: '/api/v1/invoices',
    summary: 'List invoices',
    description: 'Lists invoices with project, customer, amount and status.',
    permission: 'gatehouse:invoices:read',
    tier: 'read',
    pathParams: [],
    run: {kind: 'query', ref: internal.workspace.invoices.listInvoices}
  },
  {
    operationId: 'issueRefund',
    method: 'POST',
    path: '/api/v1/refunds',
    summary: 'Refund an invoice',
    description:
      'Refunds part or all of a paid invoice. Money leaves the business.',
    permission: 'gatehouse:refunds:create',
    tier: 'money',
    pathParams: [],
    body: {
      required: ['invoiceNumber', 'amountCents'],
      properties: {
        invoiceNumber: {type: 'string'},
        amountCents: {type: 'integer', minimum: 1},
        reason
      }
    },
    run: {kind: 'mutation', ref: internal.workspace.invoices.issueRefund}
  },
  {
    operationId: 'listMembers',
    method: 'GET',
    path: '/api/v1/members',
    summary: 'List members',
    description: 'Lists workspace members and their roles.',
    permission: 'gatehouse:members:read',
    tier: 'read',
    pathParams: [],
    run: {kind: 'query', ref: internal.workspace.members.listMembers}
  },
  {
    operationId: 'inviteMember',
    method: 'POST',
    path: '/api/v1/members',
    summary: 'Invite a member',
    description: 'Gives a person access to the workspace with a role.',
    permission: 'gatehouse:members:manage',
    tier: 'access',
    pathParams: [],
    body: {
      required: ['email', 'name', 'role'],
      properties: {
        email: {type: 'string', format: 'email'},
        name: {type: 'string', minLength: 1},
        role: {type: 'string', enum: ['viewer', 'operator', 'admin']},
        reason
      }
    },
    run: {kind: 'mutation', ref: internal.workspace.members.inviteMember}
  },
  {
    operationId: 'removeMember',
    method: 'DELETE',
    path: '/api/v1/members/{email}',
    summary: 'Remove a member',
    description:
      'Removes a person from the workspace. They lose access at once.',
    permission: 'gatehouse:members:manage',
    tier: 'access',
    pathParams: ['email'],
    run: {kind: 'mutation', ref: internal.workspace.members.removeMember}
  },
  {
    operationId: 'exportCustomers',
    method: 'POST',
    path: '/api/v1/exports/customers',
    summary: 'Export customer records',
    description:
      'Sends customer names, emails and companies to a destination URL. In this demo the export is recorded but no data leaves the app.',
    permission: 'gatehouse:customers:export',
    flag: 'bulk_export',
    tier: 'exfil',
    pathParams: [],
    body: {
      required: ['destination', 'scope'],
      properties: {
        destination: {type: 'string', format: 'uri'},
        scope: {type: 'string', enum: ['all', 'company']},
        company: {type: 'string'},
        reason
      }
    },
    run: {kind: 'mutation', ref: internal.workspace.customers.exportCustomers}
  }
];

export function reasonLocation(operation: Operation) {
  if (operation.method === 'GET') return null;
  return operation.method === 'DELETE' ? 'query' : 'body';
}

export const API_PREFIX = '/api/v1/';

const compiled = operations.map((operation) => ({
  operation,
  pattern: new RegExp(
    '^' + operation.path.replace(/\{[^}]+\}/g, '([^/]+)') + '$'
  )
}));

export function matchOperation(method: string, pathname: string) {
  for (const {operation, pattern} of compiled) {
    if (operation.method !== method) continue;
    const match = pattern.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    operation.pathParams.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
    });
    return {operation, params};
  }
  return null;
}

export function operationById(operationId: string) {
  return operations.find((o) => o.operationId === operationId) ?? null;
}
