import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProject } from "./project";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function project(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "dfd-project-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

const base = { tsconfig: "tsconfig.json", env: {}, nodeVersion: "v22.1.0", command: ["tsx", "src/server.ts"] };
const good = { "package.json": '{"type":"module"}', "tsconfig.json": "{}" };

describe("checkProject", () => {
  it("is quiet for a project that fits", () => {
    expect(checkProject({ ...base, dir: project(good) })).toEqual({ errors: [], warnings: [] });
  });

  it("refuses production", () => {
    const { errors } = checkProject({ ...base, dir: project(good), env: { NODE_ENV: "production" } });
    expect(errors.join()).toMatch(/production/);
  });

  it("refuses Node older than 20", () => {
    expect(checkProject({ ...base, dir: project(good), nodeVersion: "v18.19.0" }).errors.join()).toMatch(/Node 20/);
    expect(checkProject({ ...base, dir: project(good), nodeVersion: "v20.0.0" }).errors).toEqual([]);
  });

  it("warns, without stopping, about a CommonJS project", () => {
    const result = checkProject({ ...base, dir: project({ ...good, "package.json": "{}" }) });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join()).toMatch(/CommonJS/);
  });

  it("warns when there is no package.json or no tsconfig", () => {
    expect(checkProject({ ...base, dir: project({ "tsconfig.json": "{}" }) }).warnings.join()).toMatch(/package\.json/);
    expect(checkProject({ ...base, dir: project({ "package.json": '{"type":"module"}' }) }).warnings.join()).toMatch(/static map will be empty/);
  });

  it("warns when the command does not look like it runs TypeScript with tsx", () => {
    expect(checkProject({ ...base, dir: project(good), command: ["node", "dist/server.js"] }).warnings.join()).toMatch(/tsx/);
  });

  it("does not warn for package-manager scripts, which may run tsx inside", () => {
    for (const first of ["npm", "pnpm", "yarn", "npx", "pnpm.cmd"]) {
      expect(checkProject({ ...base, dir: project(good), command: [first, "run", "dev"] }).warnings).toEqual([]);
    }
  });
});
