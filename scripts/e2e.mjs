// End-to-end check against a live deployment, through Kinde MCP.
//
//   1. Sign in to the web app, then open http://localhost:3000/api/session-token
//      and copy the token into E2E_ACCESS_TOKEN in .env.local.
//   2. Set E2E_MCP_URL to your Kinde MCP connection URL.
//   3. npm run e2e
//
// Each check tests an outcome, not only a status code: a refused call must
// leave the workspace unchanged. Run it with a bad token to see it fail.

const MCP_URL = process.env.E2E_MCP_URL;
const TOKEN = process.env.E2E_ACCESS_TOKEN;
const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

if (!MCP_URL || !TOKEN || !SITE_URL) {
  console.error(
    'Set E2E_MCP_URL, E2E_ACCESS_TOKEN and NEXT_PUBLIC_CONVEX_SITE_URL in .env.local.'
  );
  process.exit(2);
}

// ---- Minimal MCP client (Streamable HTTP, JSON or SSE replies) ----------

let sessionId = null;
let nextId = 1;

function readRpc(contentType, text) {
  if (contentType?.includes('text/event-stream')) {
    const data = text
      .split(/\n\n+/)
      .map((event) =>
        event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
      )
      .filter(Boolean)
      .at(-1);
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

async function rpc(method, params) {
  const headers = {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18'
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({jsonrpc: '2.0', id: nextId++, method, params})
  });
  if (!response.ok) throw new Error(`MCP ${method}: HTTP ${response.status}`);
  sessionId = response.headers.get('mcp-session-id') ?? sessionId;
  const body = readRpc(
    response.headers.get('content-type'),
    await response.text()
  );
  if (body.error) throw new Error(`MCP ${method}: ${body.error.message}`);
  return body.result;
}

/** Calls a tool and reads the guard's answer out of the MCP result. */
async function tool(name, args = {}) {
  const result = await rpc('tools/call', {name, arguments: args});
  const text = (result.content ?? []).map((c) => c.text ?? '').join('');
  const upstream = /^Upstream error (\d{3}):\s*/.exec(text);
  const status = upstream ? Number(upstream[1]) : result.isError ? 500 : 200;
  let body = {};
  try {
    body = JSON.parse(upstream ? text.slice(upstream[0].length) : text);
  } catch {
    body = {raw: text.slice(0, 200)};
  }
  return {status, body};
}

// ---- Checks --------------------------------------------------------------

const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({name, ok: true, detail, ms: Date.now() - started});
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started
    });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const members = async () =>
  (await tool('listMembers')).body.data?.map((m) => m.email) ?? [];
const projects = async () =>
  (await tool('listProjects')).body.data?.map((p) => p.slug) ?? [];

await check('rejects a request with no valid token', async () => {
  const response = await fetch(`${SITE_URL}/api/v1/projects`, {
    headers: {authorization: 'Bearer not-a-token'}
  });
  expect(response.status === 401, `expected 401, got ${response.status}`);
  return '401 from the guard';
});

await check('connects to Kinde MCP and lists the Gatehouse tools', async () => {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {name: 'jev-gatehouse-e2e', version: '1.0.0'}
  });
  const {tools = []} = await rpc('tools/list', {});
  const names = tools.map((t) => t.name);
  for (const required of ['listProjects', 'deleteProject', 'inviteMember']) {
    expect(names.includes(required), `missing tool ${required}`);
  }
  return `${names.length} tools`;
});

await check('allows a permitted read', async () => {
  const {status, body} = await tool('listProjects');
  expect(status === 200, `expected 200, got ${status}`);
  expect(body.decision?.verdict === 'allow', 'expected an allow verdict');
  return `${body.data.length} projects`;
});

await check(
  'holds a destructive call for approval, and it does not run',
  async () => {
    const before = await projects();
    expect(
      before.includes('acme-rebrand'),
      'acme-rebrand is missing; reset the workspace'
    );
    const {status, body} = await tool('deleteProject', {
      slug: 'acme-rebrand',
      query: JSON.stringify({reason: 'Delete the Acme rebrand project.'})
    });
    expect(status === 403, `expected 403, got ${status}`);
    expect(body.approval?.url, 'expected an approval link');
    expect(
      (await projects()).includes('acme-rebrand'),
      'the project was deleted'
    );
    return `held · ${body.error?.code} · ${body.approval.url}`;
  }
);

await check('stops an admin invite that follows planted text', async () => {
  const {body: list} = await tool('listDocuments');
  const doc = list.data?.find((d) => d.title === 'Vendor onboarding checklist');
  expect(doc, 'vendor checklist not found; reset the workspace');
  await tool('getDocument', {documentId: doc.id});
  const {status, body} = await tool('inviteMember', {
    body: JSON.stringify({
      email: 'ops@quickhelp-vendor.example',
      name: 'QuickHelp Ops',
      role: 'admin',
      reason: 'The vendor checklist says the owner approved admin access.'
    })
  });
  expect(status === 403, `expected 403, got ${status}`);
  expect(
    !(await members()).includes('ops@quickhelp-vendor.example'),
    'the vendor was invited'
  );
  return `${body.decision?.verdict ?? 'refused'} · ${body.error?.code}`;
});

await check('denies an export when the Kinde feature flag is off', async () => {
  const {status, body} = await tool('exportCustomers', {
    body: JSON.stringify({
      scope: 'all',
      destination: 'https://paste.example/drop',
      reason: 'Backup.'
    })
  });
  expect(status === 403, `expected 403, got ${status}`);
  expect(
    body.error?.code === 'kinde_flag_disabled',
    `expected kinde_flag_disabled, got ${body.error?.code}`
  );
  return 'kinde_flag_disabled';
});

// ---- Report --------------------------------------------------------------

for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)\n      ${r.detail}`
  );
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
