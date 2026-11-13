# Build plan (14 days)

Work one day at a time. Tick the boxes when the "Done when" line is true. Build capture (days 4 to 6) before polishing visuals (days 8 to 10).

## Day 1: Sample app
- [x] pnpm workspace and repo layout from `CLAUDE.md`
- [x] `apps/sample-app`: React login form, Express `POST /login`, Postgres users table, Redis session, one LLM enrichment call, WebSocket push to the client
- Done when: a login in the browser runs all five hops from `docs/ARCHITECTURE.md` and the client shows the pushed result.

## Day 2: OpenTelemetry in the sample app
- [x] OTel SDK with HTTP, Postgres and Redis instrumentations in the sample app
- [x] `packages/collector` skeleton receiving spans
- Done when: a login produces spans for each hop that the collector receives and prints.

## Day 3: Static indexer
- [x] `packages/indexer` with ts-morph: functions, imports, direct call edges, Express routes, DB and cache call sites
- [x] Output `{ nodes, edges }` with `provenance: 'static'`
- Done when: indexing the sample app lists its functions and the main login call chain, and a test asserts it.

## Day 4: Function wrapper
- [x] Load-time transform in `packages/capture` wrapping project functions with enter and exit events
- [x] Excludes `node_modules`, tests and generated files
- Done when: calling `handleLogin()` emits events for it and the functions it calls, with durations.

## Day 5: Correlation and armed triggers
- [x] `AsyncLocalStorage` trigger context
- [x] Trigger propagation across HTTP and the WebSocket message
- [x] Wrappers are pass-through unless armed
- Done when: arming "user login" and logging in tags every event with the trigger id; unarmed traffic emits nothing.

## Day 6: Redaction and overhead guards
- [x] In-process redaction (key denylist, size cap)
- [x] Skip rules for trivial functions, call-count collapsing, production refusal
- Done when: tests show passwords and tokens never leave the process, and the package throws under `NODE_ENV=production`.

## Day 7: Store and stream
- [ ] Collector stores events in SQLite
- [ ] WebSocket `/stream` pushes map, events and trigger state
- Done when: a stored trigger can be read back in order, and a WebSocket client receives live events.

## Day 8: Canvas
- [ ] `apps/dashboard` with React Flow rendering the static map
- [ ] Provenance styling: observed, static, inferred
- Done when: the sample app's map renders and static-only edges look different from observed ones.

## Day 9: Live view
- [ ] Packets animate along edges as real events arrive
- [ ] `PayloadDiff` for the selected hop
- [ ] `CallStack` view for a selected service
- Done when: a real login animates through all five hops and each hop shows its before and after payload.

## Day 10: Replay
- [ ] Scrub and replay stored triggers
- Done when: a past login can be replayed step by step.

## Day 11: Large-repo benchmark
- [ ] Run the indexer and capture on one large open-source TypeScript repo (ask which)
- [ ] Record index time, functions indexed, observed versus static-only edge share, overhead with a trigger armed
- Done when: the numbers are in `docs/BENCHMARKS.md`.

## Day 12: Hosted demo
- [ ] Deploy the dashboard and sample app with a "simulate login" button
- Done when: a stranger can click the button and watch a login flow through the system.

## Day 13: Docs and media
- [ ] README with the live demo link in the first line, supported stack stated plainly
- [ ] 30-second GIF, 60-second video, short architecture write-up
- Done when: the README makes sense to someone who has never seen the project.

## Day 14: Buffer and launch
- [ ] Fix what slipped, then publish
