import type {Metadata} from 'next';
import {CopyField} from '@/components/copy-field';
import {PageIntro} from '@/components/page-intro';

export const metadata: Metadata = {
  title: 'Connect your agent · Jev Gatehouse',
  description:
    'Connect Cursor or any MCP client to the Gatehouse API through Kinde Secure MCP. Kinde signs the user in and passes their token to the guard.'
};

export const revalidate = 3600;

type Spec = {
  paths?: Record<
    string,
    Record<string, {operationId?: string; summary?: string}>
  >;
};

async function loadTools() {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!site) return [];
  try {
    const response = await fetch(`${site}/api/openapi.json`, {
      next: {revalidate: 3600}
    });
    if (!response.ok) return [];
    const spec = (await response.json()) as Spec;
    return Object.values(spec.paths ?? {}).flatMap((methods) =>
      Object.entries(methods).map(([method, op]) => ({
        name: op.operationId ?? '',
        method: method.toUpperCase(),
        summary: op.summary ?? ''
      }))
    );
  } catch {
    return [];
  }
}

const FLOW = [
  {
    who: 'Kinde',
    text: 'Signs the user in through the browser with OAuth, the first time the client connects.'
  },
  {
    who: 'Kinde',
    text: 'Turns each operation in our OpenAPI spec into an MCP tool, and hosts the connection on its own URL.'
  },
  {
    who: 'Kinde',
    text: "Passes the user's access token through to our API, with the header X-Kinde-User-Id: {{kinde.user.id}}."
  },
  {
    who: 'Guard',
    text: 'Verifies the token, reads the organization permissions and feature flags, and asks Jev about the call.'
  },
  {
    who: 'Ledger',
    text: 'Records the decision before the call runs. It shows on the home page at once.'
  }
];

export default async function ConnectPage() {
  const mcpUrl =
    process.env.GATEHOUSE_MCP_URL ??
    'https://<your_kinde_subdomain>.kinde.com/mcp/<connection_id>';
  const tools = await loadTools();
  const cursorConfig = JSON.stringify(
    {mcpServers: {'jev-gatehouse': {url: mcpUrl}}},
    null,
    2
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10">
      <PageIntro eyebrow="Connect your agent" title="Bring your own agent">
        <p>
          The workspace API has no MCP server of its own. Kinde Secure MCP
          builds one from the OpenAPI spec, signs the user in, and passes their
          token to the API. The guard then checks every call, from any client,
          the same way.
        </p>
      </PageIntro>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-extrabold">
          1. Add the connection
        </h2>
        <CopyField label="The Kinde MCP connection URL" value={mcpUrl} />
        <p className="text-sm text-muted">
          In Cursor, add it to{' '}
          <code className="font-mono">.cursor/mcp.json</code>. The first tool
          call opens a Kinde sign-in in your browser.
        </p>
        <CopyField label=".cursor/mcp.json" value={cursorConfig} />
        <p className="text-sm text-muted">
          Kinde gives each connection a Quick start page with the setup for
          other clients. We tested this connection with a browser MCP client and
          with the in-app agent.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-extrabold">
          2. What happens on each call
        </h2>
        <ol className="flex flex-col gap-2">
          {FLOW.map((step, index) => (
            <li
              key={step.text}
              className="grid grid-cols-[2rem_5rem_1fr] items-baseline gap-2 border-t border-line pt-2 text-sm"
            >
              <span className="font-mono text-xs text-faint">0{index + 1}</span>
              <span className="font-display font-extrabold">{step.who}</span>
              <span className="text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-extrabold">
          3. The tools your agent gets
        </h2>
        {tools.length === 0 ? (
          <p className="text-sm text-muted">
            The tool list comes from{' '}
            <code className="font-mono">/api/openapi.json</code> on your Convex
            site.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map((tool) => (
              <li
                key={tool.name}
                className="flex items-baseline gap-2 rounded-lg border border-line bg-card px-3 py-2"
              >
                <span className="w-14 shrink-0 font-mono text-[11px] text-faint">
                  {tool.method}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-sm">
                    {tool.name}
                  </span>
                  <span className="text-xs text-muted">{tool.summary}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line p-5">
        <h2 className="font-semibold">Try it</h2>
        <p className="text-sm text-muted">
          Ask your agent to summarise the vendor onboarding checklist. The
          document tells the agent to invite an outside admin. Watch the ledger
          on the home page stamp that call.
        </p>
      </section>
    </main>
  );
}
