# The `dfd` command

`dfd` ("data flow debugger", a working name) sets the debugger up on your codebase. The project name and npm scope are still undecided, so for now it is used from a local checkout of this repo.

## What it needs

A TypeScript app that fits the v1 stack:

- Node 20 or newer, with Express, run from source with `tsx`. A built `dist/` is not traced.
- ES modules (`"type": "module"`). Capture compiles your TypeScript as ES modules, so a CommonJS project may fail to load.
- Dev only. `dfd dev` refuses to run when `NODE_ENV=production`.

## Get the command

From this repo, once:

```bash
pnpm install
pnpm link --global --dir packages/cli     # puts `dfd` on your PATH
```

Without linking you can run `node <this repo>/packages/cli/bin/dfd.mjs ...` instead.

## `dfd dev`: trace your app with one command

From your project folder:

```bash
dfd dev -- tsx src/server.ts
```

Put your normal start command after `--`; it can also be `npm run dev`. This:

1. starts the collector and the dashboard (http://localhost:5174),
2. indexes your code in the background and sends the map to the dashboard,
3. runs your command with capture loaded, so your functions are wrapped and your Postgres and Redis calls are traced.

It changes nothing in your project. Its own data goes in `.dfd/` (which ignores itself).

Then open the dashboard, type a trigger name and press **Arm**, and use your app. The dashboard shows the request moving through your code: packets on edges, the hops with their before and after payloads, the call stack, and a replay of every stored trigger. Press **Disarm** when you are done. While nothing is armed, your app runs as it normally would.

Options:

| Option | Meaning |
| --- | --- |
| `--dir <folder>` | project folder (default: the current one) |
| `--tsconfig <file>` | tsconfig used for the map (default `tsconfig.json`) |
| `--arm <name>` | arm a trigger at start-up |
| `--port <n>` | collector port (default 4318) |
| `--dashboard-port <n>` | dashboard port (default 5174) |
| `--data-dir <folder>` | where the collector keeps its database (default `.dfd` in the project) |
| `--no-dashboard` | do not start the dashboard |
| `--no-otel` | do not trace Postgres and Redis |
| `--no-index` | do not build the static map |
| `--open` | open the dashboard in your browser |

Everything after `--` belongs to your command, including its own flags.

## `dfd init`: make it permanent

```bash
dfd init                 # uses your "dev" script
dfd init --script start  # or name another one
```

Adds a `dev:trace` script to `package.json` (it runs your dev script through `dfd dev`) and adds `.dfd/` to `.gitignore`. Running it twice changes nothing, and it never overwrites an existing `dev:trace`. After that, `npm run dev:trace` is the one command.

## What to expect

- **Slow on big payloads while armed.** On Directus, an authenticated read was about 37 times slower with a trigger armed (see `BENCHMARKS.md`). Arm only while you test.
- **Indexing time.** Large repos take minutes (148 s for Directus's `api/`). The app starts straight away and the map arrives when it is ready.
- **Classes are not covered.** Only top-level named functions and `const` arrow functions are mapped and wrapped, not class methods or anonymous callbacks.
- **Start-up is slower** by about 12 s on a 1,250-file app, from compiling files as they load.
- **It checks first.** `dfd dev` warns before starting if the project is CommonJS, has no tsconfig, or the command doesn't look like it runs TypeScript with `tsx`.

## How it works, briefly

`dfd dev` adds one `--import` to `NODE_OPTIONS` for your command. That preload skips package managers and the `tsx` launcher, and in the process that runs your code it loads capture (the loader that wraps your functions), a forwarder (sends events to the collector and follows the armed state), and an OpenTelemetry setup for Postgres and Redis. The map is built by the indexer in a separate process with the same root folder capture uses, so ids line up.
