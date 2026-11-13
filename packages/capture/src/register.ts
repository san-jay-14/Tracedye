import { existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import "./runtime"; // defines globalThis.__captureWrap before any wrapped code loads

// Use as `node --import capture/register`. Wraps code under the working directory.
function findWorkspaceRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    if (path.dirname(dir) === dir) return from;
  }
}

const projectDir = process.cwd();
register("./loader.ts", import.meta.url, {
  data: { projectDir, rootDir: findWorkspaceRoot(projectDir) },
});
