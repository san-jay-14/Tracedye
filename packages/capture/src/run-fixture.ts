import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Runs fixtures/<name>.ts in a child process with the loader registered, the way an
// app would run, and returns the JSON it prints on its last line.
export function runFixture<T>(name: string, env: Record<string, string> = {}): T {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
  const register = pathToFileURL(path.resolve(here, "register.js")).href;
  const output = execFileSync(process.execPath, [tsxCli, "--import", register, `${name}.ts`], {
    cwd: path.resolve(here, "../fixtures"),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return JSON.parse(output.trim().split("\n").pop()!) as T;
}
