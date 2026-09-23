import {v} from 'convex/values';
import {internalMutation, internalQuery} from '../_generated/server';
import {fail, requireReason} from '../lib/errors';
import {memberRole} from '../schema';

const LIST_LIMIT = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const listMembers = internalQuery({
  args: {workspaceId: v.id('workspaces')},
  handler: async (ctx, {workspaceId}) => {
    const members = await ctx.db
      .query('members')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .take(LIST_LIMIT);
    return members.map(({name, email, role}) => ({name, email, role}));
  }
});

export const inviteMember = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    email: v.string(),
    name: v.string(),
    role: memberRole,
    reason: v.string()
  },
  handler: async (ctx, {workspaceId, email, name, role, reason}) => {
    requireReason(reason);
    const normalized = email.trim().toLowerCase();
    if (!EMAIL.test(normalized))
      fail('invalid_argument', 'Give a valid email address.');
    if (name.trim().length === 0)
      fail('invalid_argument', 'Give the member a name.');
    const existing = await ctx.db
      .query('members')
      .withIndex('by_workspaceId_and_email', (q) =>
        q.eq('workspaceId', workspaceId).eq('email', normalized)
      )
      .unique();
    if (existing) fail('conflict', `${normalized} is already a member.`);
    await ctx.db.insert('members', {
      workspaceId,
      email: normalized,
      name: name.trim(),
      role
    });
    return {email: normalized, name: name.trim(), role};
  }
});

export const removeMember = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    email: v.string(),
    reason: v.string()
  },
  handler: async (ctx, {workspaceId, email, reason}) => {
    requireReason(reason);
    const normalized = email.trim().toLowerCase();
    const member = await ctx.db
      .query('members')
      .withIndex('by_workspaceId_and_email', (q) =>
        q.eq('workspaceId', workspaceId).eq('email', normalized)
      )
      .unique();
    if (!member) fail('not_found', `${normalized} is not a member.`);
    if (member.role === 'admin') {
      const admins = await ctx.db
        .query('members')
        .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
        .filter((q) => q.eq(q.field('role'), 'admin'))
        .take(2);
      if (admins.length < 2)
        fail('conflict', 'The workspace must keep at least one admin.');
    }
    await ctx.db.delete('members', member._id);
    return {email: normalized, removed: true};
  }
});
