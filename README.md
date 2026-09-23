# Jev Gatehouse: Jev agent authorization with Kinde

A starter kit that checks every AI agent tool call before it runs. Kinde checks who the agent acts for and what that user can do. Jev, the System One model from TypeSafe AI, judges each call in about 200 ms. Policy code in the app decides: allow the call, ask the user to approve it, or stop it.

**Live demo:** [jev-gatehouse.vercel.app](https://jev-gatehouse.vercel.app)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://makeapullrequest.com) [![Kinde Docs](https://img.shields.io/badge/Kinde-Docs-eee?style=flat-square)](https://kinde.com/docs/developer-tools) [![Kinde Community](https://img.shields.io/badge/Kinde-Community-eee?style=flat-square)](https://thekindecommunity.slack.com)

![Jev Gatehouse: the live ledger, with the stats block and the gate](docs/hero.png)

## What it does

An agent calls a small workspace API through a Kinde MCP connection. The Kinde MCP server passes the user's access token to the API. The guard in front of the API runs these steps for each call:

1. Verifies the Kinde access token (issuer, audience, signature).
2. Reads the user's permissions and feature flags for the organization, from the token or from the Kinde Management API.
3. Denies the call if a Kinde permission or flag is missing. Allows reads that have the permission.
4. Sends every other call to Jev with the user's request, the tool call and the documents the agent read. Jev returns calibrated signals: does the call match the request, is it destructive, does it follow planted text, does it send data out, and how risky is it.
5. Decides in code from the signals. A low-confidence call goes to an LLM judge.
6. Writes the decision to a ledger before anything runs. If the write fails, the call does not run.

A call that needs approval is held for 10 minutes. The user approves it on a page that requires a fresh sign-in. The held call then runs once.

The app has five pages:

- **Ledger** (`/`): a live stream of every decision, with the Kinde checks, the Jev signals and the cost.
- **Agent console** (`/console`): an in-app agent that uses the same Kinde MCP path as any external client.
- **Attack playground** (`/playground`): scripted attacks, such as planted instructions in a document, that go through the real guard.
- **Benchmark** (`/benchmark`): 300 labeled tool calls, three ways to decide, and the results.
- **Connect** (`/connect`): the Kinde MCP URL, the Cursor setup, and the tools that Kinde builds from the OpenAPI spec.

## Who it is for and when to use it

Use this kit if your product has an API and your users want to reach it from an AI agent. For example:

- A SaaS team that ships an MCP server so customers can use the product from Cursor, Claude or their own agents.
- A platform team that puts internal APIs behind an agent.
- A developer who connects an agent to production data and wants a check before each write.

Add the guard when an agent can do something that is hard to undo: delete data, move money, change who has access, or send data out. Permissions alone do not stop these calls. An agent can follow text that it read in a document, and the user's permissions still allow the call. The guard asks a second question on every call: did the user ask for this?

Reads that the user has permission for skip Jev, so they add no cost.

## How it works

```mermaid
flowchart LR
  subgraph Clients
    A1[Cursor or another MCP client]
    A2[In-app agent]
  end
  subgraph Kinde
    K1[Secure MCP connection]
    K2[Sign-in, organizations, permissions, feature flags]
  end
  subgraph Convex
    G[Guard]
    L[(Decision ledger)]
    W[Workspace API]
  end
  J[Jev on OpenRouter]
  U[Approval page with fresh Kinde sign-in]

  A1 --> K1
  A2 --> K1
  K1 -- "user token + X-Kinde-User-Id" --> G
  G -- "verify token, read access" --> K2
  G -- "state: call, request, what the agent read" --> J
  J -- "typed signals" --> G
  G --> L
  G -- "allow" --> W
  G -- "step-up: held call" --> U
  U -- "approved once" --> W
```

For each call, the guard makes one decision:

```mermaid
sequenceDiagram
  participant Agent
  participant Kinde as Kinde MCP
  participant Guard
  participant Jev
  participant Ledger
  participant API as Workspace API

  Agent->>Kinde: tools/call deleteProject
  Kinde->>Guard: DELETE /api/v1/projects/acme-rebrand (user token)
  Guard->>Guard: verify token, check permission and flag
  Guard->>Jev: tool call, user request, content the agent read
  Jev-->>Guard: matches 0.90, destructive 0.96, injected 0.06
  Guard->>Ledger: step_up, high_impact_operation
  Guard-->>Kinde: 403 with approval link
  Kinde-->>Agent: held, give the user this link
  Note over Guard,API: The user signs in again with Kinde and approves. The call runs once.
```

## Screenshots

| The ledger | An attack, stopped |
| --- | --- |
| ![The ledger with the gate strip and verdict stamps](docs/ledger.png) | ![The playground stops an admin invite that follows planted text](docs/playground-deny.png) |
| **A destructive call, held for approval** | **Connect any agent through Kinde MCP** |
| ![A delete is held until the user approves it with a fresh Kinde sign-in](docs/playground-held.png) | ![The connect page shows the Kinde MCP flow and the tools Kinde builds from the OpenAPI spec](docs/connect.png) |

![The benchmark page compares Jev signals with policy code, the Jev single verdict and an LLM judge](docs/benchmark.png)

## Benchmark results

The benchmark sends the same 300 tool calls, 3 times each, to three deciders. The false-allow rate is the share of calls that should not run but were allowed.

| Decider | False-allow | Accuracy | p50 latency | Cost per 1,000 calls |
| --- | --- | --- | --- | --- |
| Jev signals with policy code (this kit) | 0.0% | 83.7% | 205 ms | $0.029 |
| Jev single verdict | 12.4% | 71.3% | 204 ms | $0.033 |
| LLM judge (Claude Sonnet 5) | 7.9% | 77.6% | 2,073 ms | $0.931 |

We wrote the cases and the labels. Run `npm run bench` to measure your own deployment. The benchmark page shows the limits of the method.

## Development

### Requirements

- Node.js 20.17 or later
- A [Kinde](https://kinde.com) business
- A [Convex](https://convex.dev) account
- An [OpenRouter](https://openrouter.ai) API key, for Jev, the LLM judge and the in-app agent

### Initial set up

1. Clone the repository to your machine:

   ```bash
   git clone https://github.com/kinde-starter-kits/jev-agent-authorization.git
   ```

2. Go into the project:

   ```bash
   cd jev-agent-authorization
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Copy the environment file:

   ```bash
   cp .env.local.sample .env.local
   ```

5. Start Convex. This creates a deployment and writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` to `.env.local`:

   ```bash
   npx convex dev
   ```

### Set up Kinde

1. **API.** Create an API with the audience `https://gatehouse.api`. Add these permissions:

   | Permission                   | Lets the user               |
   | ---------------------------- | --------------------------- |
   | `gatehouse:projects:read`    | List and read projects      |
   | `gatehouse:projects:write`   | Archive projects            |
   | `gatehouse:projects:delete`  | Delete projects             |
   | `gatehouse:docs:read`        | List and read documents     |
   | `gatehouse:docs:write`       | Create and change documents |
   | `gatehouse:invoices:read`    | List invoices               |
   | `gatehouse:refunds:create`   | Refund invoices             |
   | `gatehouse:members:read`     | List members                |
   | `gatehouse:members:manage`   | Invite and remove members   |
   | `gatehouse:customers:export` | Export customer records     |

2. **Roles.** Create `viewer` (the read permissions), `operator` (the read permissions plus `docs:write`, `projects:write` and `refunds:create`) and `admin` (all permissions). Give your user a role in the organization the app uses.
3. **Feature flag.** Create a boolean flag `bulk_export` at organization scope, default off. Exports need it.
4. **Web app.** Create a back-end web application. Authorize it for the API. Set the callback URL to `http://localhost:3000/api/auth/kinde_callback` and the logout URL to `http://localhost:3000`. Put its values in the `KINDE_*` variables of `.env.local`.
5. **M2M app.** Create a machine-to-machine application with the Management API scopes `read:organization_user_permissions` and `read:organization_feature_flags`. The guard uses it when a token has no organization, which is the case for most MCP clients.
6. **MCP connection.** Create a Secure MCP connection:
   - OpenAPI spec: `https://<your-deployment>.convex.site/api/openapi.json`
   - Back-end URL: your Convex site URL
   - Authentication: pass the user token through
   - Extra header: `X-Kinde-User-Id: {{kinde.user.id}}`

   Do not turn on role-based access control for the MCP sign-in. MCP sign-ins have no organization, so Kinde refuses them. The guard checks organization permissions itself.

### Set Convex environment variables

Set these with `npx convex env set NAME value`:

| Variable | Value |
| --- | --- |
| `KINDE_ISSUER_URL` | `https://<your_kinde_subdomain>.kinde.com` |
| `GATEHOUSE_AUDIENCE` | `https://gatehouse.api` |
| `GATEHOUSE_ORG_CODE` | The organization code the app uses |
| `KINDE_M2M_CLIENT_ID`, `KINDE_M2M_CLIENT_SECRET` | From the M2M app |
| `KINDE_WEB_CLIENT_ID` | The web app client ID |
| `GATEHOUSE_APP_URL` | `http://localhost:3000` |
| `GATEHOUSE_MCP_URL` | Your Kinde MCP connection URL |
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `JEV_MODEL` | Optional. Default `typesafe/jev-1.13` |
| `LLM_JUDGE_MODEL` | The model for the LLM judge, for example `anthropic/claude-sonnet-5` |
| `AGENT_MODEL` | Optional. The model for the in-app agent |

### Run the app

Run Convex and Next.js in two terminals:

```bash
npx convex dev
npm run dev
```

Open http://localhost:3000 and sign in. The app creates your workspace on the first call. To put the workspace back to its first state:

```bash
npx convex run seed:resetWorkspace '{"ownerSub":"<your_kinde_user_id>"}'
```

### Connect an MCP client

Add your Kinde MCP connection URL to an MCP client such as Cursor. The client signs you in through Kinde. Every tool call then goes through the guard and shows on the ledger.

### Test

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests for the guard, the policy, Jev parsing, the agent and the benchmark |
| `npm run e2e` | A live check through Kinde MCP. Set `E2E_MCP_URL` and `E2E_ACCESS_TOKEN` first. See `scripts/e2e.mjs` |
| `npm run bench` | Runs the 300-case benchmark on your deployment. It makes about 2,000 model calls |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |

A commit runs ESLint and Prettier on the staged files.

### Project structure

- `convex/guard/`: token checks, Kinde access, policy, the guard handler and the approval routes
- `convex/jev/`: the Jev questions, the Jev client and the LLM judge
- `convex/agent/`: the in-app agent, its MCP client and the attack scenarios
- `convex/bench/`: benchmark cases, runner and metrics
- `convex/workspace/`: the workspace operations that the agent calls
- `src/app/`: the Next.js pages

## Documentation

- [Kinde docs](https://kinde.com/docs/) for sign-in, permissions, feature flags and MCP connections
- [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) for Jev
- [Convex docs](https://docs.convex.dev) for the back end

## Publishing

This is a starter kit, so there is no package to publish. A GitHub Action runs lint, typecheck, tests and a build on every push and pull request to `main`.

## Contributing

Please refer to Kinde’s [contributing guidelines](https://github.com/kinde-oss/.github/blob/489e2ca9c3307c2b2e098a885e22f2239116394a/CONTRIBUTING.md).

## License

By contributing to Kinde, you agree that your contributions will be licensed under its MIT License.
