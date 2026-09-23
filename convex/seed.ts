import {v} from 'convex/values';
import type {Id} from './_generated/dataModel';
import {internalMutation, type MutationCtx} from './_generated/server';
import * as data from './lib/seedData';

const DAY_MS = 24 * 60 * 60 * 1000;

const workspaceTables = [
  'refunds',
  'invoices',
  'documents',
  'customers',
  'members',
  'projects'
] as const;

async function clearWorkspace(ctx: MutationCtx, workspaceId: Id<'workspaces'>) {
  for (const table of workspaceTables) {
    if (table === 'refunds') {
      const invoices = await ctx.db
        .query('invoices')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
        .collect();
      for (const invoice of invoices) {
        const refunds = await ctx.db
          .query('refunds')
          .withIndex('by_invoice', (q) => q.eq('invoiceId', invoice._id))
          .collect();
        for (const refund of refunds) await ctx.db.delete(refund._id);
      }
      continue;
    }
    const rows = await ctx.db
      .query(table)
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

export async function seedWorkspace(ctx: MutationCtx, ownerSub: string) {
  const existing = await ctx.db
    .query('workspaces')
    .withIndex('by_owner', (q) => q.eq('ownerSub', ownerSub))
    .unique();

  let workspaceId: Id<'workspaces'>;
  if (existing) {
    await clearWorkspace(ctx, existing._id);
    await ctx.db.patch(existing._id, {seedVersion: data.SEED_VERSION});
    workspaceId = existing._id;
  } else {
    workspaceId = await ctx.db.insert('workspaces', {
      ownerSub,
      name: data.workspaceName,
      seedVersion: data.SEED_VERSION
    });
  }

  const projectIds = new Map<data.ProjectSlug, Id<'projects'>>();
  for (const project of data.projects) {
    const id = await ctx.db.insert('projects', {
      workspaceId,
      ...project,
      status: 'active'
    });
    projectIds.set(project.slug, id);
  }

  const customerIds: Id<'customers'>[] = [];
  for (const customer of data.customers) {
    customerIds.push(
      await ctx.db.insert('customers', {workspaceId, ...customer})
    );
  }

  const now = Date.now();
  for (const invoice of data.invoices) {
    const projectId = projectIds.get(invoice.project);
    const customerId = customerIds[invoice.customer];
    if (!projectId || !customerId)
      throw new Error(`Bad seed row ${invoice.number}`);
    await ctx.db.insert('invoices', {
      workspaceId,
      projectId,
      customerId,
      number: invoice.number,
      amountCents: invoice.amountCents,
      currency: 'USD',
      status: invoice.status,
      issuedAt: now - invoice.daysAgo * DAY_MS
    });
  }

  for (const member of data.members) {
    await ctx.db.insert('members', {workspaceId, ...member});
  }

  for (const document of data.documents) {
    await ctx.db.insert('documents', {
      workspaceId,
      projectId: document.project
        ? projectIds.get(document.project)
        : undefined,
      title: document.title,
      body: document.body
    });
  }

  return workspaceId;
}

export const resetWorkspace = internalMutation({
  args: {ownerSub: v.string()},
  returns: v.id('workspaces'),
  handler: (ctx, {ownerSub}) => seedWorkspace(ctx, ownerSub)
});
