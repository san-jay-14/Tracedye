import path from "node:path";
import { performance } from "node:perf_hooks";
import { indexProjectDetailed } from "./index";

// Usage: pnpm --filter indexer index <path to tsconfig.json> [root dir]
// The map goes to stdout; a one-line summary of the run goes to stderr.
const tsConfig = path.resolve(process.argv[2] ?? "");
const rootDir = path.resolve(process.argv[3] ?? process.cwd());

const start = performance.now();
const { map, filesIndexed } = indexProjectDetailed(tsConfig, rootDir);
const seconds = ((performance.now() - start) / 1000).toFixed(1);

function count(items: { kind?: string; provenance?: string }[], key: "kind" | "provenance"): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item[key] ?? "?", (counts.get(item[key] ?? "?") ?? 0) + 1);
  return [...counts].map(([name, n]) => `${name}=${n}`).join(" ");
}

console.error(
  `indexed ${filesIndexed} files in ${seconds}s: ${map.nodes.length} nodes (${count(map.nodes, "kind")}), ` +
    `${map.edges.length} edges (${count(map.edges, "provenance")})`,
);
console.log(JSON.stringify(map, null, 2));
