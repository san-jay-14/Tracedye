# Benchmarks: Directus

One large open-source TypeScript repo, indexed and run with capture. Numbers are from a single run on one machine, so treat small differences as noise.

## What was measured

| | |
| --- | --- |
| Repo | [Directus](https://github.com/directus/directus), commit `3ba2201be9a783cffdc9de0b970a075ff199607f` (shallow clone) |
| Scope | `api/` package: Node, Express, TypeScript, about 1,250 files and 85,000 lines in `api/src` |
| Machine | Windows 11, Intel Core i7-12650H (16 logical cores), 15.7 GB RAM |
| Runtime | Node v25.2.1, Directus database on Postgres 16 in Docker (a scratch database) |
| Capture | this repo's `packages/capture`, run with `--import capture/register` |

## Deviations from a normal Directus setup

These are part of the result. They are the reason the numbers should not be read as a general claim.

- **Node 25, not 26.** Directus declares Node 26. It installed with the engine check switched off and ran on Node 25 without crashing in these runs (it logged warnings about unreadable upload and extension folders).
- **Postgres, not SQLite.** The `sqlite3` native module has no build for this Node version and there is no C++ compiler on the machine.
- **`isolated-vm` is stubbed.** It is a native module with no build here. Directus loads it at start-up but only uses it for sandboxed extensions and the "exec" flow operation. Neither was exercised.
- **Minimal configuration.** No Redis (Directus used its in-memory store), caching and rate limiting off, WebSockets off, no extensions, and the admin app not served.
- **Dependencies were installed with `--ignore-scripts`** and only for the `api` package and what it depends on.

## Indexer

`pnpm --filter indexer index <api/tsconfig.json> <repo root>`

| | |
| --- | --- |
| Files indexed | 1,251 |
| Index time | 147.8 s (one run) |
| Function nodes | 1,405 (1,213 outside test files) |
| Static edges | 1,396 (1,339 outside test files) |
| Nodes with no edge at all | 461 |
| Store or AI nodes found | 0 |
| Route nodes | 51 |

What this shows:

- **Slow on a repo this size.** 148 s is far from "re-runs on every file save". The time is dominated by loading the whole TypeScript project and resolving types. Nothing was done to speed it up.
- **Classes are invisible.** Directus is mostly classes (services) and anonymous router handlers. The indexer maps only top-level named functions and `const` arrow functions, so 1,405 nodes is a small fraction of its real functions, and the call graph has many holes.
- **No store nodes.** The indexer recognises `pg`, `ioredis` and the Anthropic SDK. Directus reaches its database through knex, so no Postgres edges exist in the static map.
- **Tests are indexed.** 192 nodes are in test files, because the indexer does not exclude them (capture does). Both counts are given above.
- **Route ids collapse.** A route is named by its method and the path given to the router, without the prefix the router is mounted at. Many routers register `GET /`, so they become one node.

## Observed versus static-only edges

One armed run (`exercise.sh`) that sent a single request to each of: `/server/ping`, `/server/info`, `/users/me`, `/roles`, `/collections`, `/fields`, `/items/directus_users` (a 403), `/permissions`, `/activity`, `/settings`, after one login. The edge counts come from the same merge the dashboard uses, so "observed" means a runtime event showed that call.

| | All indexed files | Excluding test files |
| --- | --- | --- |
| Events captured | 4,278 in 12 triggers | |
| Distinct functions that ran | 104 | |
| Function nodes seen running | 105 of 1,405 (7.5%) | 105 of 1,213 (8.7%) |
| Static edges seen running | 93 of 1,396 (6.7%) | 93 of 1,339 (6.9%) |
| Edges seen only at runtime | 103 | 103 |
| Observed share of all edges | 13.1% | 13.6% |

What this shows:

- **About 7% of the static edges were exercised** by ten different endpoints. That is a result of how little of Directus those requests touch and of the narrow set of functions the tool can see, not a measure of the code's quality.
- **More edges were observed than the static map predicted from them.** 103 calls were seen at runtime that the indexer had no edge for. They were not inspected one by one; the likely sources are class methods, callbacks and other wiring the indexer cannot follow. This is the case the provenance tags exist for.
- **No database or cache edges** appear, since there are no store nodes and Directus has no OpenTelemetry in this setup.

## Runtime overhead

Sequential requests over localhost (`overhead.mjs`), 50 warm-up requests, then 300 timed (100 for login). Times are in milliseconds; p50 and p95 shown.

| Request | No capture | Capture, unarmed | Capture, armed |
| --- | --- | --- | --- |
| `GET /server/ping` | 0.91 / 1.63 | 0.82 / 1.40 | 1.01 / 1.62 |
| `GET /users/me` (authenticated) | 11.09 / 17.80 | 11.30 / 14.80 | **408.88 / 527.15** |
| `POST /auth/login` | 513.86 / 526.43 | 513.96 / 527.02 | 546.92 / 588.80 |
| Start-up to first successful request | 16.2 s | 28.8 s | 28.9 s |

What this shows:

- **Unarmed capture is free on requests.** The differences are within the run-to-run noise. This is the "wrappers are pass-through unless armed" rule holding on a real app.
- **Start-up costs about 12.6 s.** Capture compiles every project file through the TypeScript compiler as it loads, instead of through esbuild.
- **Armed capture is cheap when little data moves** (ping: about +0.1 ms; login: about +6%, hidden by the password hash).
- **Armed capture is very expensive on an authenticated read: about 37 times slower** (11 ms to 409 ms at p50). That is not acceptable as a default and is the main finding of this benchmark.
- **Likely cause.** One request produced 300 to 1,000 function events and 0.3 to 1.5 MB of payload; many payloads sat at the 4 KB cap. Directus passes large schema, permission and query objects through long call chains, and capture redacts and size-caps every argument and return value of every wrapped call. The cost was not profiled, so this is an explanation consistent with the data, not a confirmed cause.

## A bug the benchmark found

The first armed run crashed Directus: capture treated any object with a `.then` as a promise and called it, which runs a lazy query builder (knex) early and hands the caller a promise where it expected the builder. Capture now only treats a real `Promise` that way. There is a regression test. The numbers above are from after the fix.

## Not measured

- Memory use.
- More than one run per case, or any confidence interval.
- Concurrent load. Requests were sequential.
- Node 26, SQLite, or a production-like Directus configuration.
- Any other repo.

## Reproducing

The scripts used were kept outside this repo (`D:\saas\bench`). The steps:

1. `git clone --depth 1 https://github.com/directus/directus.git`, check out `3ba2201`.
2. Install with `pnpm@12` and `--filter "api..." --ignore-scripts --config.engine-strict=false`, then build `--filter "api^..."`.
3. Create a Postgres database, set `DB_CLIENT=pg` and the connection variables, replace the `isolated-vm` entry file with an inert stub, and run `tsx src/cli/run.ts bootstrap`.
4. Index: `pnpm --filter indexer index <repo>/api/tsconfig.json <repo>` (summary line on stderr).
5. Run `tsx src/start.ts` plain, with `--import <repo>/packages/capture/src/register.js`, and with capture plus an armed trigger, timing requests against each.
