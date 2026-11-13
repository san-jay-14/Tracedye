# Spec: Data Flow Debugger v1

## Goal

Let a developer arm a trigger (for example "user login"), use their real app, and watch that exact event move through the system on a dashboard: where the data goes, how it is transformed or enriched, what is stored and retrieved, and which functions ran. The data is real, not simulated.

It is also a visual way to understand a codebase: every captured trigger is stored and can be replayed step by step.

## Scope of v1

- Supported stack: TypeScript, Node (Express), React (Vite), Postgres, Redis, one LLM call. Next.js is v2.
- Runs on localhost and staging only. No production use, sampling, auth or multi-tenancy.
- Ships with a sample app and a hosted demo with a "simulate login" button anyone can click.
- Function-level capture of project code, so developers don't add console.log.

Out of scope for v1: other languages, eBPF capture, Next.js, production use, AI-generated edges, auto-discovery beyond the supported stack.

## Two usage modes

1. **Greenfield.** The tool is installed before the app exists. The static indexer re-runs on every file save, so the map stays current as functions are written. Optionally a coding-agent hook records the intent of each function.
2. **Existing codebase.** The indexer scans the repo once, then updates incrementally. Runtime observation fills in what static analysis cannot see.

## Design principle

Runtime events are the source of truth for edges. Static analysis supplies the map. The AI supplies names and summaries, never edges. Anything not observed is shown as such.

## Dashboard UX

- **Trigger bar.** Pick or name a trigger, arm it, then use the real app. Shows armed state and captured hop count.
- **Canvas.** React Flow map of services, stores and third parties built from the static index. Nodes grouped by kind: app, data store, AI, external.
- **Live packets.** Each real hop animates a block along its edge. Edges never exercised stay faded and dashed.
- **Payload diff.** Click a hop to see the payload before and after, with added, changed and removed fields highlighted.
- **Semantic zoom.** System, then service, then file, then function. Opening a service shows the function call stack for this trigger with timings.
- **Replay.** Stored triggers can be scrubbed and replayed step by step.
- **Provenance styling.** Observed, static and inferred edges look different at a glance.

Reference mock (login flow: React, Express, Postgres, LLM, Redis, WebSocket push) was shown in the design conversation; the hop data used there is in `docs/ARCHITECTURE.md` under "Sample login trace".

## Risks

- **Overhead.** Wrapping every function can slow hot paths. Mitigate with armed-only capture, skip rules and call-count collapsing. Measure before claiming anything.
- **PII.** Payloads can hold secrets. Redaction runs in-process, defaults to deny, and the tool refuses to run in production.
- **Dynamic wiring.** Dependency injection, event emitters and string-keyed handlers are invisible statically. Provenance tags make that visible.
- **Scope creep.** Build capture first, animation second. A deep capture layer with plain visuals beats polished visuals on shallow capture.

## Benchmarks to publish in the README

Measured on one large open-source TypeScript repo:

- index time and functions indexed
- share of edges observed versus static-only
- runtime overhead with a trigger armed

## Audience and goal

Hiring teams and the open-source community. Priorities: a live demo anyone can click, a GIF and short video, a clean README, and visible engineering depth (context propagation, redaction, provenance).
