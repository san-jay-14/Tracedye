// Plain JavaScript (types in JSDoc, checked by tsc), see filter.js.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProjectSource } from "./filter.js";
import { wrapSource } from "./transform.js";

/**
 * @typedef {object} LoaderConfig
 * @property {string} projectDir only code under here is wrapped
 * @property {string} rootDir node ids are relative to here, to match the indexer
 */

/** @type {LoaderConfig} */
let config;

/** @param {LoaderConfig} data */
export function initialize(data) {
  config = data;
}

/**
 * Registered after tsx, so this runs first for project files. It compiles them itself
 * (ESM only) and short-circuits; every other module falls through to tsx.
 * @type {import("node:module").LoadHook}
 */
export async function load(url, context, nextLoad) {
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
}
