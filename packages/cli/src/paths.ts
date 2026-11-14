import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Preloads } from "./env";

export interface Runtime {
  preloads: Preloads;
  // The dashboard is served from built files; in a repo checkout without a build it falls back to Vite.
  dashboard: { kind: "static"; dir: string } | { kind: "vite"; root: string };
  // How to run the indexer; it is given the tsconfig and the root folder as its last two arguments.
  indexer: { command: string; args: string[] };
}

export const hereDir = () => path.dirname(fileURLToPath(import.meta.url));

const fileUrl = (...parts: string[]) => pathToFileURL(path.join(...parts)).href;

// Two layouts. In the published package everything sits beside this file, inside dist/.
// In a checkout of the repo, the pieces are workspace packages and are looked up by name.
export function locateRuntime(base = hereDir()): Runtime {
  if (existsSync(path.join(base, "capture", "register.js"))) {
    return {
      preloads: {
        start: fileUrl(base, "preload", "start.mjs"),
        captureRegister: fileUrl(base, "capture", "register.js"),
        captureForward: fileUrl(base, "capture", "forward.js"),
        otel: fileUrl(base, "preload", "otel.mjs"),
      },
      dashboard: { kind: "static", dir: path.join(base, "dashboard") },
      indexer: { command: process.execPath, args: [path.join(base, "indexer.js")] },
    };
  }

  const require = createRequire(import.meta.url);
  const dashboardRoot = path.dirname(require.resolve("dashboard/package.json"));
  const built = path.join(dashboardRoot, "dist");
  return {
    preloads: {
      start: fileUrl(base, "preload", "start.mjs"),
      captureRegister: pathToFileURL(require.resolve("capture/register")).href,
      captureForward: pathToFileURL(require.resolve("capture/forward")).href,
      otel: fileUrl(base, "preload", "otel.mjs"),
    },
    dashboard: existsSync(path.join(built, "index.html")) ? { kind: "static", dir: built } : { kind: "vite", root: dashboardRoot },
    indexer: {
      command: process.execPath,
      args: [require.resolve("tsx/cli"), path.join(path.dirname(require.resolve("indexer/package.json")), "src", "cli.ts")],
    },
  };
}
