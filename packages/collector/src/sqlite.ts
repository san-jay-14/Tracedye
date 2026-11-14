import { createRequire } from "node:module";

type Sqlite = typeof import("node:sqlite");

let loaded: Sqlite | undefined;

// Node's built-in SQLite (22.13 and newer) means nothing has to be compiled when this is installed.
// Older Node versions print an "experimental" notice the first time it loads; it is not useful to
// someone running a debugging tool, so that one message is dropped and every other warning is kept.
export function loadSqlite(): Sqlite {
  if (loaded) return loaded;

  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (typeof warning === "string" && warning.includes("SQLite is an experimental feature")) return;
    return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;

  try {
    loaded = createRequire(import.meta.url)("node:sqlite") as Sqlite;
  } finally {
    process.emitWarning = emitWarning;
  }
  return loaded;
}
