import {v} from 'convex/values';
import type {Id} from '../_generated/dataModel';
import {internalMutation, internalQuery} from '../_generated/server';
import {fail} from '../lib/errors';

const LIST_LIMIT = 100;

export const listInvoices = internalQuery({
  args: {workspaceId: v.id('workspaces')},
  handler: async (ctx, {workspaceId}) => {
    const invoices = await ctx.db
      .query('invoices')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .take(LIST_LIMIT);
    const projects = new Map<Id<'projects'>, string>();
    const customers = new Map<Id<'customers'>, string>();
    for (const invoice of invoices) {
      if (!projects.has(invoice.projectId)) {
        const project = await ctx.db.get('projects', invoice.projectId);
        if (project) projects.set(project._id, project.slug);
      }
      if (!customers.has(invoice.customerId)) {
        const customer = await ctx.db.get('customers', invoice.customerId);
        if (customer) customers.set(customer._id, customer.name);
      }
    }
    return invoices.map((i) => ({
      number: i.number,
      project: projects.get(i.projectId) ?? null,
      customer: customers.get(i.customerId) ?? null,
      amountCents: i.amountCents,
      currency: i.currency,
      status: i.status,
      issuedAt: new Date(i.issuedAt).toISOString()
    }));
  }
});

export const issueRefund = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    invoiceNumber: v.string(),
    amountCents: v.number(),
    reason: v.optional(v.string())
  },
  handler: async (
    ctx,
    {workspaceId, actorSub, invoiceNumber, amountCents, reason}
  ) => {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      fail('invalid_argument', 'amountCents must be a positive whole number.');
    }
    const invoice = await ctx.db
      .query('invoices')
      .withIndex('by_workspaceId_and_number', (q) =>
        q.eq('workspaceId', workspaceId).eq('number', invoiceNumber)
      )
      .unique();
    if (!invoice) fail('not_found', `No invoice "${invoiceNumber}".`);
    if (invoice.status !== 'paid') {
      fail(
        'conflict',
        `Invoice ${invoiceNumber} is ${invoice.status}. Only paid invoices can be refunded.`
      );
    }

    const refunds = await ctx.db
      .query('refunds')
      .withIndex('by_invoiceId', (q) => q.eq('invoiceId', invoice._id))
      .take(1000);
    const refundedSoFar = refunds.reduce((sum, r) => sum + r.amountCents, 0);

    const remaining = invoice.amountCents - refundedSoFar;
    if (amountCents > remaining) {
      fail(
        'conflict',
        `Only ${remaining} cents can still be refunded on ${invoiceNumber}.`
      );
    }

    await ctx.db.insert('refunds', {
      workspaceId,
      invoiceId: invoice._id,
      amountCents,
      reason: reason?.trim() ?? '',
      createdBySub: actorSub
    });
    const fullyRefunded = amountCents === remaining;
    if (fullyRefunded) {
      await ctx.db.patch('invoices', invoice._id, {status: 'refunded'});
    }
    return {
      invoiceNumber,
      refundedCents: amountCents,
      currency: invoice.currency,
      invoiceStatus: fullyRefunded ? ('refunded' as const) : invoice.status
    };
  }
});
