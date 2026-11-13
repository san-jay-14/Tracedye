# Architecture

Items marked **(default)** are proposals for the build to confirm, not requirements.

## Components

1. **Indexer** (`packages/indexer`). Uses ts-morph to extract functions, signatures, imports, direct call edges, Express route handlers, and DB/cache client call sites. Output is a map of nodes and edges, all with `provenance: 'static'`. Deterministic. Re-runs on file save.
2. **Capture** (`packages/capture`). Dev-only package added to the target app with one init command. Wraps project functions at load time and collects OpenTelemetry spans for HTTP, Postgres and Redis. LLM calls are wrapped explicitly.
3. **Collector** (`packages/collector`). Local process. Receives function events and spans, stores them in SQLite, streams them to the dashboard over WebSocket.
4. **Dashboard** (`apps/dashboard`). React Flow canvas fed by the map and the live event stream.
5. **AI labeling** (optional, later). Names and summarizes nodes a trigger touched. Cached by file hash. Never creates edges.

```
target app --events/spans--> collector --WebSocket--> dashboard
indexer ------map (static)--> collector
```

## Capture layer

- **Function wrapping.** Load-time transform (SWC or Babel plugin, or a Node loader hook) wraps functions in project source. Exclude `node_modules`, tests and generated files. Each wrapper emits enter and exit events with a function id (`file:name:line`), duration, and redacted args and return value.
- **Correlation.** `AsyncLocalStorage` carries the current trigger id through async calls. OpenTelemetry context propagation carries it across HTTP, queue and WebSocket boundaries.
- **Armed triggers.** Wrappers are pass-through until the dashboard arms a trigger. Unarmed traffic must cost almost nothing.
- **Redaction.** Key denylist: password, token, authorization, cookie, secret, plus anything configured. Applied in-process before export. Per-value size cap **(default: 4 KB, configurable)**.
- **Overhead guards.** Skip trivial functions (getters, one-liners). Collapse functions called many times in one trigger into a counter. Refuse to start when `NODE_ENV=production`.
- **Boundaries.** Use existing OpenTelemetry instrumentations for HTTP, Postgres and Redis. Wrap LLM calls so prompt and response are captured as one hop.

## Types

```ts
type EventKind = 'function' | 'http' | 'db' | 'cache' | 'llm' | 'ws';
type Provenance = 'observed' | 'static' | 'inferred';

interface FlowEvent {
  id: string;
  triggerId: string;
  traceId: string;
  spanId: string;
  parentId?: string;
  kind: EventKind;
  nodeId: string;            // static map node: "file:name:line" or service name
  startMs: number;           // relative to trigger start
  durationMs: number;
  input?: unknown;           // redacted, size-capped
  output?: unknown;          // redacted, size-capped
  error?: { message: string; stack?: string };
}

interface MapNode {
  id: string;
  kind: 'app' | 'store' | 'ai' | 'external';
  label: string;
  file?: string;
  line?: number;
}

interface MapEdge {
  from: string;
  to: string;
  provenance: Provenance;
}
```

Edge rendering:

| Provenance | Meaning | Drawn as |
| --- | --- | --- |
| observed | Seen at runtime during a trigger | Solid, animated when active |
| static | Found by the compiler, never seen running | Dashed, faded |
| inferred | Suggested by AI, not confirmed | Dotted, labeled "inferred" |

## Collector interface

Keep it small. **(default)** HTTP for ingest, WebSocket for the dashboard:

- `POST /events`: batch of `FlowEvent`
- `POST /map`: indexer output (`{ nodes: MapNode[], edges: MapEdge[] }`)
- `POST /triggers/:name/arm` and `/disarm`
- WebSocket `/stream`: pushes `map`, `event` and `trigger-state` messages
- SQLite tables: `triggers`, `events`, `map_nodes`, `map_edges`

## Dashboard components

- `TriggerBar`: arm and status
- `FlowCanvas`: React Flow map with provenance styling and live packets
- `PayloadDiff`: before and after for the selected hop (added, changed, removed)
- `CallStack`: function calls inside the selected service with timings
- `ReplayControls`: scrub stored triggers

## Sample login trace (used for the mock and the demo)

Trigger: user login. Hops:

| Hop | From to | What | ms | Before | After |
| --- | --- | --- | --- | --- | --- |
| 1 | React to Express | POST /login | 12 | email, password (redacted) | adds ip |
| 2 | Express to Postgres | SELECT user by email | 18 | email | id, email, plan, password_hash (redacted) |
| 3 | Express to LLM | Enrich profile | 640 | plan, events_30d | adds segment (LLM output) |
| 4 | Express to Redis | SET session | 3 | userId, segment | key, ttl, userId, segment |
| 5 | Express to React | WebSocket push | 2 | key, userId, segment | type login_ok, user {id, plan, segment} |

Function stack inside Express for this trigger: `handleLogin()` 705 ms, with `validateCredentials()` 20 ms, `enrichProfile()` 641 ms, `createSession()` 4 ms, `notifyClient()` 2 ms. An `Email service` node exists in code but never ran, so it renders as static (dashed, faded).

## Known limits

- Static analysis misses dynamic wiring (dependency injection, event emitters, string-keyed handlers). Those edges appear only after a trigger exercises them.
- LLM-built call graphs are less reliable and far more expensive than compiler-built ones, so edges always come from the compiler or from runtime, never from the LLM.
- Rendering hundreds of nodes is unreadable. The canvas shows the traced path with semantic zoom, not the whole graph at once.
