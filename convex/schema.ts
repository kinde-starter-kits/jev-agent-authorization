import {defineSchema, defineTable} from 'convex/server';
import {v} from 'convex/values';

export const memberRole = v.union(
  v.literal('viewer'),
  v.literal('operator'),
  v.literal('admin')
);

export const verdict = v.union(
  v.literal('allow'),
  v.literal('step_up'),
  v.literal('deny')
);

export const decisionStatus = v.union(
  v.literal('pending'),
  v.literal('executed'),
  v.literal('failed'),
  v.literal('refused'),
  v.literal('held'),
  v.literal('denied'),
  v.literal('expired')
);

export const heldStatus = v.union(
  v.literal('pending'),
  v.literal('executed'),
  v.literal('failed'),
  v.literal('denied'),
  v.literal('expired')
);

export const tier = v.union(
  v.literal('read'),
  v.literal('write'),
  v.literal('money'),
  v.literal('access'),
  v.literal('destructive'),
  v.literal('exfil')
);

export const kindeCheck = v.object({
  orgCode: v.optional(v.string()),
  source: v.optional(v.union(v.literal('token'), v.literal('kinde_api'))),
  permission: v.string(),
  permissionGranted: v.boolean(),
  flag: v.optional(v.string()),
  flagEnabled: v.optional(v.boolean())
});

export const intentSource = v.union(
  v.literal('verified'),
  v.literal('claimed'),
  v.literal('none')
);

export const jevRecord = v.object({
  model: v.string(),
  ms: v.number(),
  inputTokens: v.number(),
  costUsd: v.optional(v.number()),
  matchesIntent: v.number(),
  destructive: v.number(),
  injected: v.number(),
  exfiltration: v.number(),
  risk: v.number(),
  riskConfidence: v.number(),
  verdictHint: verdict,
  verdictHintConfidence: v.number()
});

export const judgeRecord = v.object({
  model: v.string(),
  ms: v.number(),
  verdict,
  costUsd: v.optional(v.number())
});

export default defineSchema({
  workspaces: defineTable({
    ownerSub: v.string(),
    name: v.string(),
    seedVersion: v.number()
  }).index('by_ownerSub', ['ownerSub']),

  projects: defineTable({
    workspaceId: v.id('workspaces'),
    slug: v.string(),
    name: v.string(),
    client: v.string(),
    status: v.union(v.literal('active'), v.literal('archived'))
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_and_slug', ['workspaceId', 'slug']),

  documents: defineTable({
    workspaceId: v.id('workspaces'),
    projectId: v.optional(v.id('projects')),
    title: v.string(),
    body: v.string(),
    updatedBySub: v.optional(v.string())
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_projectId', ['projectId']),

  customers: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    email: v.string(),
    company: v.string(),
    country: v.string()
  }).index('by_workspaceId', ['workspaceId']),

  invoices: defineTable({
    workspaceId: v.id('workspaces'),
    projectId: v.id('projects'),
    customerId: v.id('customers'),
    number: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal('open'),
      v.literal('paid'),
      v.literal('refunded')
    ),
    issuedAt: v.number()
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_and_number', ['workspaceId', 'number']),

  refunds: defineTable({
    workspaceId: v.id('workspaces'),
    invoiceId: v.id('invoices'),
    amountCents: v.number(),
    reason: v.string(),
    createdBySub: v.string()
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_invoiceId', ['invoiceId']),

  members: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    email: v.string(),
    role: memberRole
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_workspaceId_and_email', ['workspaceId', 'email']),

  exports: defineTable({
    workspaceId: v.id('workspaces'),
    destination: v.string(),
    scope: v.union(v.literal('all'), v.literal('company')),
    company: v.optional(v.string()),
    recordCount: v.number(),
    createdBySub: v.string()
  }).index('by_workspaceId', ['workspaceId']),

  decisions: defineTable({
    workspaceId: v.id('workspaces'),
    sub: v.string(),
    clientId: v.optional(v.string()),
    operationId: v.string(),
    tier,
    method: v.string(),
    path: v.string(),
    argsJson: v.string(),
    kinde: kindeCheck,
    reason: v.optional(v.string()),
    intentSource: v.optional(intentSource),
    jev: v.optional(jevRecord),
    judge: v.optional(judgeRecord),
    verdict,
    reasonCode: v.string(),
    policyVersion: v.string(),
    status: decisionStatus,
    errorCode: v.optional(v.string()),
    latency: v.object({
      guardMs: v.number(),
      operationMs: v.optional(v.number())
    })
  })
    .index('by_workspaceId', ['workspaceId'])
    .index('by_sub', ['sub']),

  stats: defineTable({
    key: v.literal('global'),
    total: v.number(),
    allowed: v.number(),
    steppedUp: v.number(),
    denied: v.number(),
    judged: v.number(),
    jevCostUsd: v.number(),
    judgeCalls: v.number(),
    judgeCostUsd: v.number()
  }).index('by_key', ['key']),

  benchRuns: defineTable({
    status: v.union(
      v.literal('running'),
      v.literal('done'),
      v.literal('failed')
    ),
    repeats: v.number(),
    caseCount: v.number(),
    chunksTotal: v.number(),
    chunksDone: v.number(),
    jevModel: v.string(),
    llmModel: v.string(),
    policyVersion: v.string(),
    finishedAt: v.optional(v.number()),
    summaryJson: v.optional(v.string())
  }).index('by_status', ['status']),

  benchResults: defineTable({
    runId: v.id('benchRuns'),
    caseId: v.string(),
    category: v.string(),
    expected: verdict,
    arm: v.union(
      v.literal('gatehouse'),
      v.literal('jev_single'),
      v.literal('llm_judge')
    ),
    repeat: v.number(),
    verdict,
    ms: v.number(),
    costUsd: v.number(),
    error: v.boolean(),
    parseFailed: v.boolean(),
    note: v.optional(v.string())
  }).index('by_runId', ['runId']),

  benchCalibration: defineTable({
    runId: v.id('benchRuns'),
    signal: v.union(v.literal('injected'), v.literal('matchesIntent')),
    predicted: v.number(),
    actual: v.boolean()
  }).index('by_runId', ['runId']),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number()
  }).index('by_key', ['key']),

  kindeAccessCache: defineTable({
    sub: v.string(),
    orgCode: v.string(),
    permissions: v.array(v.string()),
    featureFlags: v.record(v.string(), v.boolean()),
    expiresAt: v.number()
  }).index('by_sub_and_orgCode', ['sub', 'orgCode']),

  servedContent: defineTable({
    sub: v.string(),
    source: v.string(),
    title: v.string(),
    excerpt: v.string()
  }).index('by_sub', ['sub']),

  heldCalls: defineTable({
    decisionId: v.id('decisions'),
    sub: v.string(),
    workspaceId: v.id('workspaces'),
    operationId: v.string(),
    argsJson: v.string(),
    status: heldStatus,
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
    authAgeSeconds: v.optional(v.number()),
    errorCode: v.optional(v.string())
  })
    .index('by_decisionId', ['decisionId'])
    .index('by_status_and_expiresAt', ['status', 'expiresAt']),

  runs: defineTable({
    sub: v.string(),
    message: v.string(),
    status: v.union(
      v.literal('running'),
      v.literal('done'),
      v.literal('held'),
      v.literal('refused'),
      v.literal('failed')
    ),
    model: v.string(),
    turns: v.number(),
    costUsd: v.number(),
    finalText: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    endedAt: v.optional(v.number())
  })
    .index('by_sub', ['sub'])
    .index('by_sub_and_status', ['sub', 'status']),

  runSteps: defineTable({
    runId: v.id('runs'),
    index: v.number(),
    kind: v.union(v.literal('assistant'), v.literal('tool')),
    text: v.optional(v.string()),
    tool: v.optional(v.string()),
    argsJson: v.optional(v.string()),
    ok: v.optional(v.boolean()),
    httpStatus: v.optional(v.number()),
    code: v.optional(v.string()),
    decisionId: v.optional(v.id('decisions')),
    heldCallId: v.optional(v.id('heldCalls')),
    approvalUrl: v.optional(v.string()),
    resultPreview: v.optional(v.string())
  }).index('by_runId_and_index', ['runId', 'index'])
});
