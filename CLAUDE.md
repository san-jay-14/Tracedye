# Tracedye

A dev-time tool that shows one real event (for example a user login) moving through a TypeScript app, with the payload visible at every hop and function-level detail, so developers don't need console.log. Built as a portfolio and open-source project, not a product.

Read these before writing code:

- `docs/SPEC.md`: goals, scope, dashboard UX, risks
- `docs/ARCHITECTURE.md`: components, capture layer, event schema, repo layout
- `docs/PLAN.md`: 14-day build plan with acceptance criteria

## Stack (v1)

- TypeScript (strict), Node 22.13+ (the collector uses the built-in node:sqlite), pnpm workspaces, Vitest
- Static analysis: ts-morph (TypeScript compiler API)
- Runtime capture: OpenTelemetry JS plus a load-time function wrapper
- Collector: Node process, SQLite (node:sqlite, built in, nothing to compile), WebSocket (ws)
- Dashboard: React, Vite, React Flow
- Sample app: React (Vite), Express, Postgres, Redis, one LLM call, WebSocket push

Supported application stack for v1 is TypeScript on Node with Express and React. Next.js is v2. Do not add support for other languages or frameworks.

## Repo layout

```
apps/sample-app/      demo app the tool is built and demoed against
apps/dashboard/       React Flow dashboard
packages/indexer/     static analysis, produces the map
packages/capture/     dev-only runtime package (wrapper, correlation, redaction)
packages/collector/   receives events, stores them, streams to dashboard
packages/cli/         the `tracedye` command: one-command setup into a codebase (docs/CLI.md)
docs/
```

## Working rules

- Do only what was asked. Keep changes minimal. No speculative abstractions, no extra config options, no features outside the current day in `docs/PLAN.md`.
- Write plain, readable code: short functions, clear names, comments only to explain why.
- If a file, decision or requirement is missing, ask instead of guessing.
- Work one `docs/PLAN.md` day at a time. Tick its checkboxes when the "Done when" line is true.
- Run typecheck and tests before saying a task is done. If you can't run something, say so.
- Show the exact files you changed and why when you finish.

## Non-negotiables

1. **Provenance on every edge.** Each edge on the map is `observed`, `static` or `inferred`. Never present a static or inferred edge as observed.
2. **Redact in-process.** Payloads are redacted and size-capped inside the app process before anything leaves it. Never log or store unredacted payloads.
3. **Dev-only.** The capture package refuses to start when `NODE_ENV=production`.
4. **Armed triggers only.** Function wrappers are pass-through unless a trigger is armed.
5. **Honest claims.** README and UI state the supported stack. Do not claim it works on any codebase.

## Commands

Fill these in as they exist. Do not invent commands that aren't in `package.json`.

```
pnpm install
pnpm typecheck
pnpm test
tracedye dev -- <command that starts your app>    # from packages/cli, bin "tracedye"; see docs/CLI.md
tracedye init
```

## Open decisions (ask before assuming)

- Hosting for the live demo
- Which large open-source TypeScript repo to benchmark on (Day 11)
