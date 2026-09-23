import {defineSchema, defineTable} from 'convex/server';
import {v} from 'convex/values';

export const memberRole = v.union(
  v.literal('viewer'),
  v.literal('operator'),
  v.literal('admin')
);

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
  }).index('by_workspaceId', ['workspaceId'])
});
