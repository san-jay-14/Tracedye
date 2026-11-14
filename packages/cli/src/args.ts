export interface DevOptions {
  dir: string;
  port: number; // collector; 0 picks a free one
  dashboardPort: number;
  tsconfig: string;
  dataDir?: string; // where the collector keeps its database (default: .tracedye in the project)
  arm?: string;
  dashboard: boolean;
  otel: boolean;
  index: boolean;
  open: boolean;
  command: string[]; // what to run, everything after "--"
}

export interface InitOptions {
  dir: string;
  script: string;
}

export type Parsed =
  | { kind: "dev"; options: DevOptions }
  | { kind: "init"; options: InitOptions }
  | { kind: "help" }
  | { kind: "error"; message: string };

const DEFAULT_PORT = 4318;
const DEFAULT_DASHBOARD_PORT = 5174;

export const USAGE = `tracedye: see a real request move through your TypeScript app.

Usage:
  tracedye dev [options] -- <command that starts your app>
  tracedye init [--dir <folder>] [--script <name>]

dev runs your command with capture loaded, and starts the collector and the dashboard.
Nothing in your project is changed (it keeps its own data in .tracedye/).
  Example:  tracedye dev -- tsx src/server.ts

dev options:
  --dir <folder>          project folder (default: the current one)
  --tsconfig <file>       tsconfig used to build the map (default: tsconfig.json)
  --data-dir <folder>     where to keep the collector database (default: .tracedye in the project)
  --arm <name>            arm a trigger at start-up (otherwise arm it in the dashboard)
  --port <n>              collector port (default ${DEFAULT_PORT})
  --dashboard-port <n>    dashboard port (default ${DEFAULT_DASHBOARD_PORT})
  --no-dashboard          do not start the dashboard
  --no-otel               do not trace Postgres and Redis calls
  --no-index              do not build the static map
  --open                  open the dashboard in your browser

init adds a "dev:trace" script to package.json (it runs your dev script through tracedye dev)
and ignores .tracedye/ in .gitignore.

Dev only: refuses to run when NODE_ENV=production. Supports TypeScript on Node with Express,
run from source with tsx.`;

function toPort(value: string | undefined, name: string): number | string {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 0 && n < 65536 ? n : `${name} needs a port number`;
}

export function parseArgs(argv: string[]): Parsed {
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") return { kind: "help" };

  if (name === "init") {
    const options: InitOptions = { dir: process.cwd(), script: "dev" };
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--dir" && rest[i + 1]) options.dir = rest[++i];
      else if (rest[i] === "--script" && rest[i + 1]) options.script = rest[++i];
      else return { kind: "error", message: `init: unexpected "${rest[i]}"` };
    }
    return { kind: "init", options };
  }

  if (name !== "dev") return { kind: "error", message: `unknown command "${name}"` };

  const split = rest.indexOf("--");
  const flags = split === -1 ? rest : rest.slice(0, split);
  const command = split === -1 ? [] : rest.slice(split + 1);
  if (command.length === 0) {
    return { kind: "error", message: 'dev needs the command that starts your app after "--", for example: tracedye dev -- tsx src/server.ts' };
  }

  const options: DevOptions = {
    dir: process.cwd(),
    port: DEFAULT_PORT,
    dashboardPort: DEFAULT_DASHBOARD_PORT,
    tsconfig: "tsconfig.json",
    dashboard: true,
    otel: true,
    index: true,
    open: false,
    command,
  };

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const value = flags[i + 1];
    switch (flag) {
      case "--dir": case "--tsconfig": case "--arm": case "--data-dir": {
        if (value === undefined) return { kind: "error", message: `${flag} needs a value` };
        i++;
        if (flag === "--dir") options.dir = value;
        else if (flag === "--tsconfig") options.tsconfig = value;
        else if (flag === "--data-dir") options.dataDir = value;
        else options.arm = value;
        break;
      }
      case "--port": case "--dashboard-port": {
        const port = toPort(value, flag);
        if (typeof port === "string") return { kind: "error", message: port };
        i++;
        if (flag === "--port") options.port = port;
        else options.dashboardPort = port;
        break;
      }
      case "--no-dashboard": options.dashboard = false; break;
      case "--no-otel": options.otel = false; break;
      case "--no-index": options.index = false; break;
      case "--open": options.open = true; break;
      default: return { kind: "error", message: `unknown option "${flag}"` };
    }
  }
  return { kind: "dev", options };
}
