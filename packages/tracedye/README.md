# Tracedye

See one real request move through your TypeScript app, with the payload visible at every hop and every function call, so you don't have to scatter `console.log`.

Arm a trigger, use your app, and watch that exact request travel: packets along the edges of a map of your code, the data going into and out of each hop, the function call stack with timings, and a replay of every request you captured.

```bash
npx tracedye dev -- tsx src/server.ts
```

That one command starts a local collector and dashboard, builds a map of your code, and runs your app with capture loaded. Open http://localhost:5174, name a trigger, press **Arm**, and use your app.

## What it works with

Tracedye supports **TypeScript on Node with Express**. It is not a general tool for any codebase.

- Node 22.13 or newer. (Tracedye keeps its data in Node's built-in SQLite, so nothing is compiled when you install it.)
- Your app run from source with [`tsx`](https://tsx.is). A built `dist/` folder is not traced.
- ES modules (`"type": "module"`). Capture compiles your TypeScript as ES modules, so a CommonJS project may fail to load.
- Postgres (`pg`) and Redis (`ioredis`) calls are traced automatically. Other databases show up only as the functions that call them.

## Install

```bash
npm install --save-dev tracedye
npx tracedye init          # adds a "dev:trace" script and ignores .tracedye/
npm run dev:trace
```

`tracedye init` only adds a `dev:trace` script to your `package.json` (it runs your `dev` script through Tracedye) and a `.tracedye/` line to `.gitignore`. `tracedye dev` changes nothing in your project; its data lives in `.tracedye/`.

## Commands

```
tracedye dev [options] -- <command that starts your app>
tracedye init [--dir <folder>] [--script <name>]
```

| Option | Meaning |
| --- | --- |
| `--dir <folder>` | project folder (default: the current one) |
| `--tsconfig <file>` | tsconfig used to build the map (default `tsconfig.json`) |
| `--arm <name>` | arm a trigger at start-up |
| `--port <n>` | collector port (default 4318) |
| `--dashboard-port <n>` | dashboard port (default 5174) |
| `--data-dir <folder>` | where the collector keeps its database |
| `--no-dashboard` | do not start the dashboard |
| `--no-otel` | do not trace Postgres and Redis |
| `--no-index` | do not build the static map |
| `--open` | open the dashboard in your browser |

Everything after `--` is your own command, including its own flags.

## How it stays safe

- **Dev only.** Tracedye refuses to start when `NODE_ENV=production`.
- **Armed triggers only.** Until you arm a trigger, your functions run exactly as they would without Tracedye.
- **Redacted in your process.** Arguments and return values are redacted (`password`, `token`, `authorization`, `cookie`, `secret` and anything containing them) and size-capped before anything leaves your app. Nothing unredacted is stored or logged.
- **Edges say where they came from.** An edge is *observed* only if a runtime event showed that call. Calls found only by reading your code are drawn as *static*, never as observed.

## Limits

- **Armed capture can be slow.** On a large app with big payloads, an armed request was about 37 times slower (11 ms to 409 ms on one Directus request). Arm it only while you test.
- **Classes are not covered.** Only top-level named functions and `const` arrow functions are mapped and traced, not class methods or anonymous callbacks.
- **Slow to index big repos.** The map of a 1,250-file app took about 2.5 minutes. Your app starts straight away and the map arrives when it is ready.
- **Start-up is slower** (about 12 s on that app) because files are compiled as they load.

The measurements are in [`docs/BENCHMARKS.md`](https://github.com/san-jay-14/Tracedye/blob/main/docs/BENCHMARKS.md).

## License

MIT
