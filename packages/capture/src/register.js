// Use as `node --import capture/register`. Wraps code under the working directory.
// Plain JavaScript on purpose: on Node 20 a preload can't be TypeScript.
import { existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { installHttpTrigger } from "./runtime.js"; // also defines globalThis.__captureWrap

/** @param {string} from */
function findWorkspaceRoot(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    if (path.dirname(dir) === dir) return from;
  }
}

const projectDir = process.cwd();
register("./loader.js", import.meta.url, {
  data: { projectDir, rootDir: findWorkspaceRoot(projectDir) },
});

installHttpTrigger();
