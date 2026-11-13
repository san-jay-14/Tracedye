// Plain JavaScript (types in JSDoc, checked by tsc), see runtime.js.
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The folder node ids are relative to: the nearest parent with a pnpm-workspace.yaml,
 * otherwise `from` itself. The indexer must use the same folder for its ids to match.
 * @param {string} from
 * @returns {string}
 */
export function findWorkspaceRoot(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    if (path.dirname(dir) === dir) return from;
  }
}
