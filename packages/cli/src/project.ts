import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Check {
  errors: string[]; // stop the run
  warnings: string[]; // run, but say what will not work
}

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "npx", "bun"];

// Everything that can be known about whether capture will work, before starting anything.
export function checkProject(input: {
  dir: string;
  command: string[];
  tsconfig: string;
  env: NodeJS.ProcessEnv;
  nodeVersion: string;
}): Check {
  const errors: string[] = [];
  const warnings: string[] = [];

  // The collector uses Node's built-in SQLite, which is available without a flag from 22.13.
  const [major, minor] = input.nodeVersion.replace(/^v/, "").split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    errors.push(`Node ${input.nodeVersion} is too old: tracedye needs Node 22.13 or newer.`);
  }
  if (input.env.NODE_ENV === "production") {
    errors.push("NODE_ENV is production. This tool is dev-only and refuses to run against production.");
  }

  const packageJson = path.join(input.dir, "package.json");
  if (!existsSync(packageJson)) {
    warnings.push("No package.json here. Is this the project folder? Use --dir to point at it.");
  } else {
    try {
      const pkg = JSON.parse(readFileSync(packageJson, "utf8")) as { type?: string };
      if (pkg.type !== "module") {
        warnings.push('package.json has no "type": "module". Capture compiles your TypeScript as ES modules, so a CommonJS project may fail to load.');
      }
    } catch {
      warnings.push("package.json could not be read.");
    }
  }

  if (!existsSync(path.resolve(input.dir, input.tsconfig))) {
    warnings.push(`No ${input.tsconfig} found, so the static map will be empty. Runtime capture still works. Use --tsconfig to point at it.`);
  }

  const first = input.command[0] ?? "";
  const mentionsTsx = input.command.some((part) => /tsx/.test(part));
  if (!mentionsTsx && !PACKAGE_MANAGERS.includes(path.basename(first).replace(/\.cmd$/, ""))) {
    warnings.push("Capture traces TypeScript run from source with tsx. If this command runs built JavaScript, nothing will be traced.");
  }

  return { errors, warnings };
}
