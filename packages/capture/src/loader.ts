import { readFile } from "node:fs/promises";
import type { InitializeHook, LoadHook } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProjectSource } from "./filter.ts";
import { wrapSource } from "./transform.ts";

interface LoaderConfig {
  projectDir: string; // only code under here is wrapped
  rootDir: string; // node ids are relative to here, to match the indexer
}

let config: LoaderConfig;

export const initialize: InitializeHook<LoaderConfig> = (data) => {
  config = data;
};

// Registered after tsx, so this runs first for project files. It compiles them itself
// (ESM only) and short-circuits; every other module falls through to tsx.
export const load: LoadHook = async (url, context, nextLoad) => {
  if (url.startsWith("file:")) {
    const fileUrl = new URL(url);
    fileUrl.search = ""; // tsx may add a query to resolved urls
    const filePath = fileURLToPath(fileUrl);
    if (isProjectSource(filePath, config.projectDir)) {
      const relative = path.relative(config.rootDir, filePath).replaceAll("\\", "/");
      const source = wrapSource(await readFile(filePath, "utf8"), filePath, relative);
      return { format: "module", source, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
};
