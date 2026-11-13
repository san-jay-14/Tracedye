// Use as `node --import capture/register`. Wraps code under the working directory.
// Plain JavaScript on purpose: on Node 20 a preload can't be TypeScript.
import { register } from "node:module";
import { installHttpTrigger } from "./runtime.js"; // also defines globalThis.__captureWrap
import { findWorkspaceRoot } from "./root.js";

const projectDir = process.cwd();
register("./loader.js", import.meta.url, {
  data: { projectDir, rootDir: findWorkspaceRoot(projectDir) },
});

installHttpTrigger();
