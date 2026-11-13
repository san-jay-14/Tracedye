import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface InitResult {
  changes: string[];
  notes: string[];
}

const TRACE_SCRIPT = "dev:trace";

// Adds a "dev:trace" script (your dev script, run through dfd dev) and ignores .dfd/.
// Running it twice changes nothing. Nothing else in the project is touched.
export function initProject(dir: string, scriptName: string): InitResult {
  const packageJson = path.join(dir, "package.json");
  if (!existsSync(packageJson)) throw new Error(`No package.json in ${dir}. Use --dir to point at the project.`);

  const text = readFileSync(packageJson, "utf8");
  const pkg = JSON.parse(text) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  if (!scripts[scriptName]) {
    throw new Error(`No "${scriptName}" script in package.json. Use --script <name> for the script that starts your app.`);
  }

  const changes: string[] = [];
  const notes: string[] = [];

  if (scripts[TRACE_SCRIPT]) {
    notes.push(`"${TRACE_SCRIPT}" already exists, left as it is.`);
  } else {
    pkg.scripts = { ...scripts, [TRACE_SCRIPT]: `dfd dev -- npm run ${scriptName}` };
    const indent = /^\t/m.test(text) ? "\t" : /^( +)"/m.exec(text)?.[1] ?? "  ";
    writeFileSync(packageJson, `${JSON.stringify(pkg, null, indent)}${text.endsWith("\n") ? "\n" : ""}`);
    changes.push(`package.json: added script "${TRACE_SCRIPT}"`);
  }

  const gitignore = path.join(dir, ".gitignore");
  const existing = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  if (existing.split(/\r?\n/).some((line) => line.trim() === ".dfd/" || line.trim() === ".dfd")) {
    notes.push(".gitignore already ignores .dfd/");
  } else {
    const prefix = existing === "" || existing.endsWith("\n") ? "" : "\n";
    writeFileSync(gitignore, `${existing}${prefix}.dfd/\n`);
    changes.push(".gitignore: added .dfd/");
  }

  return { changes, notes };
}
