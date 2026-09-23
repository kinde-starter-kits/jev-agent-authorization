import {v} from 'convex/values';
import type {Id} from '../_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type QueryCtx
} from '../_generated/server';
import {fail} from '../lib/errors';

const LIST_LIMIT = 100;
const CASCADE_LIMIT = 1000;

async function projectBySlug(
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  slug: string
) {
  const project = await ctx.db
    .query('projects')
    .withIndex('by_workspaceId_and_slug', (q) =>
      q.eq('workspaceId', workspaceId).eq('slug', slug)
    )
    .unique();
  if (!project) fail('not_found', `No project with slug "${slug}".`);
  return project;
}

export const listProjects = internalQuery({
  args: {workspaceId: v.id('workspaces')},
  handler: async (ctx, {workspaceId}) => {
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .take(LIST_LIMIT);
    return projects.map(({slug, name, client, status}) => ({
      slug,
      name,
      client,
      status
    }));
  }
});

export const getProject = internalQuery({
  args: {workspaceId: v.id('workspaces'), slug: v.string()},
  handler: async (ctx, {workspaceId, slug}) => {
    const project = await projectBySlug(ctx, workspaceId, slug);
    const documents = await ctx.db
      .query('documents')
      .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
      .take(LIST_LIMIT);
    const invoices = await ctx.db
      .query('invoices')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .filter((q) => q.eq(q.field('projectId'), project._id))
      .take(LIST_LIMIT);
    return {
      slug: project.slug,
      name: project.name,
      client: project.client,
      status: project.status,
      documents: documents.map((d) => ({id: d._id, title: d.title})),
      invoices: invoices.map((i) => ({
        number: i.number,
        amountCents: i.amountCents,
        currency: i.currency,
        status: i.status
      }))
    };
  }
});

export const archiveProject = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    slug: v.string(),
    reason: v.optional(v.string())
  },
  handler: async (ctx, {workspaceId, slug}) => {
    const project = await projectBySlug(ctx, workspaceId, slug);
    if (project.status === 'archived') {
      fail('conflict', `Project "${slug}" is already archived.`);
    }
    await ctx.db.patch('projects', project._id, {status: 'archived'});
    return {slug, status: 'archived' as const};
  }
});

export const deleteProject = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    slug: v.string(),
    reason: v.optional(v.string())
  },
  handler: async (ctx, {workspaceId, slug}) => {
    const project = await projectBySlug(ctx, workspaceId, slug);

    const documents = await ctx.db
      .query('documents')
      .withIndex('by_projectId', (q) => q.eq('projectId', project._id))
      .take(CASCADE_LIMIT);
    for (const document of documents) {
      await ctx.db.delete('documents', document._id);
    }

    const invoices = await ctx.db
      .query('invoices')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .filter((q) => q.eq(q.field('projectId'), project._id))
      .take(CASCADE_LIMIT);
    for (const invoice of invoices) {
      const refunds = await ctx.db
        .query('refunds')
        .withIndex('by_invoiceId', (q) => q.eq('invoiceId', invoice._id))
        .take(CASCADE_LIMIT);
      for (const refund of refunds) {
        await ctx.db.delete('refunds', refund._id);
      }
      await ctx.db.delete('invoices', invoice._id);
    }

    await ctx.db.delete('projects', project._id);
    return {
      slug,
      deleted: true,
      documentsDeleted: documents.length,
      invoicesDeleted: invoices.length
    };
  }
});
