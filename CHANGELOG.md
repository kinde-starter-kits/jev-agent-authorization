<!-- Ideally, this should get auto-generated via tools like [auto-changelog](https://github.com/CookPete/auto-changelog). Eventually, this will get set up as part of the repository template. -->

# Changelog

## 0.1.0

First release.

### Added

- A guard in front of the workspace API that checks every tool call before it runs: Kinde token checks, organization permissions and feature flags, Jev signals, policy code and an LLM judge for low-confidence calls.
- A decision ledger. The guard writes each decision before the call runs, and the call does not run if the write fails.
- Held calls for high-impact operations. The user approves a held call with a fresh sign-in, and the call runs once.
- An OpenAPI spec for a Kinde Secure MCP connection.
- An in-app agent that uses the same Kinde MCP path as external clients, with the user's request as verified intent.
- A live ledger page with stats, an agent console, an attack playground and a benchmark page.
- A 300-case benchmark that compares Jev signals with policy code, the Jev single verdict and an LLM judge.
- Rate limits for API calls and agent runs.
- Unit and integration tests, a live end-to-end script and a CI workflow.
