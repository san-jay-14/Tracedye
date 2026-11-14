// Builds the published package into dist/:
//   dist/cli.js         the command (the CLI, collector and dashboard server, bundled)
//   dist/indexer.js     the static indexer, run as its own process
//   dist/capture/*.js   capture's plain JavaScript files, which Node loads as preloads and loader hooks
//   dist/preload/*.mjs  the one preload `tracedye dev` adds to NODE_OPTIONS, and the OpenTelemetry setup
//   dist/dashboard/     the dashboard, built to static files (no Vite at run time)
import { build as esbuild } from "esbuild";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as vite } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const packages = path.resolve(here, "../..");
const dist = path.resolve(here, "../dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Installed alongside the package (see "dependencies"), so they stay out of the bundle.
const external = ["ws", "ts-morph", "typescript", "vite"];
const common = { bundle: true, platform: "node", format: "esm", target: "node22", external, logLevel: "warning" };

await esbuild({
  ...common,
  entryPoints: [path.join(packages, "cli/src/cli.ts")],
  outfile: path.join(dist, "cli.js"),
  banner: { js: "#!/usr/bin/env node" },
});
chmodSync(path.join(dist, "cli.js"), 0o755);

await esbuild({ ...common, entryPoints: [path.join(packages, "indexer/src/cli.ts")], outfile: path.join(dist, "indexer.js") });

// Plain JavaScript already, so these are copied as they are. They are loaded by Node itself
// (as preloads and loader hooks), which is why they are not bundled into cli.js.
mkdirSync(path.join(dist, "capture"));
for (const file of ["register", "loader", "runtime", "transform", "filter", "redact", "otel", "forward", "root"]) {
  cpSync(path.join(packages, `capture/src/${file}.js`), path.join(dist, "capture", `${file}.js`));
}

mkdirSync(path.join(dist, "preload"));
cpSync(path.join(packages, "cli/src/preload/start.mjs"), path.join(dist, "preload/start.mjs"));
// In the repo this imports capture by package name; here it sits next to the copy of capture.
const otel = readFileSync(path.join(packages, "cli/src/preload/otel.mjs"), "utf8");
if (!otel.includes('from "capture/otel"')) throw new Error('otel.mjs no longer imports "capture/otel"; update scripts/build.mjs');
writeFileSync(path.join(dist, "preload/otel.mjs"), otel.replace('from "capture/otel"', 'from "../capture/otel.js"'));

await vite({ root: path.resolve(packages, "../apps/dashboard"), logLevel: "warn" });
cpSync(path.resolve(packages, "../apps/dashboard/dist"), path.join(dist, "dashboard"), { recursive: true });

console.log("built dist/");
