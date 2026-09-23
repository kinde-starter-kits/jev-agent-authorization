import {convexTest} from 'convex-test';
import {ConvexError} from 'convex/values';
import {describe, expect, test} from 'vitest';
import {internal} from '../_generated/api';
import schema from '../schema';
import {modules} from '../test.setup';

async function setup() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.seed.resetWorkspace, {
    ownerSub: 'user-a'
  });
  return {t, workspaceId};
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{code: string}>).data.code).toBe(code);
    return;
  }
  throw new Error(`Expected error code ${code}`);
}

describe('seed', () => {
  test('reset is idempotent', async () => {
    const {t, workspaceId} = await setup();
    const again = await t.mutation(internal.seed.resetWorkspace, {
      ownerSub: 'user-a'
    });
    expect(again).toBe(workspaceId);
    const projects = await t.query(internal.workspace.projects.listProjects, {
      workspaceId
    });
    expect(projects).toHaveLength(3);
  });
});

describe('workspace isolation', () => {
  test('a document from another workspace is not found', async () => {
    const {t, workspaceId} = await setup();
    const other = await t.mutation(internal.seed.resetWorkspace, {
      ownerSub: 'user-b'
    });
    const [document] = await t.query(
      internal.workspace.documents.listDocuments,
      {workspaceId}
    );
    await expectCode(
      t.query(internal.workspace.documents.getDocument, {
        workspaceId: other,
        documentId: document!.id
      }),
      'not_found'
    );
  });
});

describe('issueRefund', () => {
  const base = {actorSub: 'user-a', reason: 'Client asked for a refund'};

  test('refuses an open invoice', async () => {
    const {t, workspaceId} = await setup();
    await expectCode(
      t.mutation(internal.workspace.invoices.issueRefund, {
        ...base,
        workspaceId,
        invoiceNumber: 'INV-1043',
        amountCents: 1000
      }),
      'conflict'
    );
  });

  test('a full refund marks the invoice refunded', async () => {
    const {t, workspaceId} = await setup();
    const result = await t.mutation(internal.workspace.invoices.issueRefund, {
      ...base,
      workspaceId,
      invoiceNumber: 'INV-1042',
      amountCents: 480_000
    });
    expect(result.invoiceStatus).toBe('refunded');
  });

  test('refuses more than the remaining amount', async () => {
    const {t, workspaceId} = await setup();
    await t.mutation(internal.workspace.invoices.issueRefund, {
      ...base,
      workspaceId,
      invoiceNumber: 'INV-1041',
      amountCents: 1_000_000
    });
    await expectCode(
      t.mutation(internal.workspace.invoices.issueRefund, {
        ...base,
        workspaceId,
        invoiceNumber: 'INV-1041',
        amountCents: 250_001
      }),
      'conflict'
    );
  });

  test('records a refund when no reason is given', async () => {
    const {t, workspaceId} = await setup();
    await t.mutation(internal.workspace.invoices.issueRefund, {
      workspaceId,
      actorSub: 'user-a',
      invoiceNumber: 'INV-1042',
      amountCents: 100
    });
    const [refund] = await t.run((ctx) => ctx.db.query('refunds').collect());
    expect(refund?.reason).toBe('');
  });
});

describe('deleteProject', () => {
  test('removes the project with its documents and invoices', async () => {
    const {t, workspaceId} = await setup();
    const result = await t.mutation(internal.workspace.projects.deleteProject, {
      workspaceId,
      actorSub: 'user-a',
      slug: 'acme-rebrand',
      reason: 'Clean up the finished Acme project'
    });
    expect(result).toMatchObject({documentsDeleted: 1, invoicesDeleted: 3});
    await expectCode(
      t.query(internal.workspace.projects.getProject, {
        workspaceId,
        slug: 'acme-rebrand'
      }),
      'not_found'
    );
  });
});

describe('removeMember', () => {
  test('keeps the last admin', async () => {
    const {t, workspaceId} = await setup();
    await expectCode(
      t.mutation(internal.workspace.members.removeMember, {
        workspaceId,
        actorSub: 'user-a',
        email: 'ife@harborpine.example',
        reason: 'Remove Ife from the workspace'
      }),
      'conflict'
    );
  });
});

describe('exportCustomers', () => {
  test('refuses a destination that is not https', async () => {
    const {t, workspaceId} = await setup();
    await expectCode(
      t.mutation(internal.workspace.customers.exportCustomers, {
        workspaceId,
        actorSub: 'user-a',
        destination: 'http://paste.example/drop',
        scope: 'all',
        reason: 'Back up the customer list'
      }),
      'invalid_argument'
    );
  });

  test('records the export without delivering data', async () => {
    const {t, workspaceId} = await setup();
    const result = await t.mutation(
      internal.workspace.customers.exportCustomers,
      {
        workspaceId,
        actorSub: 'user-a',
        destination: 'https://paste.example/drop',
        scope: 'all',
        reason: 'Back up the customer list'
      }
    );
    expect(result).toMatchObject({recordCount: 8, delivered: false});
  });
});
