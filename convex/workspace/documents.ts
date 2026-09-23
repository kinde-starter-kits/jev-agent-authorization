import {v} from 'convex/values';
import type {Id} from '../_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type QueryCtx
} from '../_generated/server';
import {fail} from '../lib/errors';

const LIST_LIMIT = 100;
const MAX_TITLE = 200;
const MAX_BODY = 20_000;

async function documentInWorkspace(
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  documentId: Id<'documents'>
) {
  const document = await ctx.db.get('documents', documentId);
  if (!document || document.workspaceId !== workspaceId) {
    fail('not_found', 'No document with that id.');
  }
  return document;
}

function checkText(title: string | undefined, body: string) {
  if (
    title !== undefined &&
    (title.trim().length === 0 || title.length > MAX_TITLE)
  ) {
    fail('invalid_argument', `Title must be 1 to ${MAX_TITLE} characters.`);
  }
  if (body.length > MAX_BODY) {
    fail('invalid_argument', `Body must be at most ${MAX_BODY} characters.`);
  }
}

export const listDocuments = internalQuery({
  args: {workspaceId: v.id('workspaces')},
  handler: async (ctx, {workspaceId}) => {
    const documents = await ctx.db
      .query('documents')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .take(LIST_LIMIT);
    const projects = new Map<Id<'projects'>, string>();
    for (const document of documents) {
      if (document.projectId && !projects.has(document.projectId)) {
        const project = await ctx.db.get('projects', document.projectId);
        if (project) projects.set(project._id, project.slug);
      }
    }
    return documents.map((d) => ({
      id: d._id,
      title: d.title,
      project: d.projectId ? (projects.get(d.projectId) ?? null) : null
    }));
  }
});

export const getDocument = internalQuery({
  args: {workspaceId: v.id('workspaces'), documentId: v.id('documents')},
  handler: async (ctx, {workspaceId, documentId}) => {
    const document = await documentInWorkspace(ctx, workspaceId, documentId);
    return {id: document._id, title: document.title, body: document.body};
  }
});

export const createDocument = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    title: v.string(),
    body: v.string(),
    projectSlug: v.optional(v.string()),
    reason: v.optional(v.string())
  },
  handler: async (ctx, {workspaceId, actorSub, title, body, projectSlug}) => {
    checkText(title, body);
    let projectId: Id<'projects'> | undefined;
    if (projectSlug) {
      const project = await ctx.db
        .query('projects')
        .withIndex('by_workspaceId_and_slug', (q) =>
          q.eq('workspaceId', workspaceId).eq('slug', projectSlug)
        )
        .unique();
      if (!project) fail('not_found', `No project with slug "${projectSlug}".`);
      projectId = project._id;
    }
    const id = await ctx.db.insert('documents', {
      workspaceId,
      projectId,
      title: title.trim(),
      body,
      updatedBySub: actorSub
    });
    return {id, title: title.trim()};
  }
});

export const updateDocument = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    documentId: v.id('documents'),
    body: v.string(),
    reason: v.optional(v.string())
  },
  handler: async (ctx, {workspaceId, actorSub, documentId, body}) => {
    checkText(undefined, body);
    const document = await documentInWorkspace(ctx, workspaceId, documentId);
    await ctx.db.patch('documents', document._id, {
      body,
      updatedBySub: actorSub
    });
    return {id: document._id, title: document.title, updated: true};
  }
});
