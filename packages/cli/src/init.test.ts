import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initProject } from "./init";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function project(packageJson: string, gitignore?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "tracedye-init-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "package.json"), packageJson);
  if (gitignore !== undefined) writeFileSync(path.join(dir, ".gitignore"), gitignore);
  return dir;
}
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), "utf8");

describe("initProject", () => {
  it("adds dev:trace, which runs the dev script through tracedye, and ignores .tracedye/", () => {
    const dir = project('{\n  "name": "app",\n  "scripts": {\n    "dev": "tsx watch src/server.ts"\n  }\n}\n');
    const result = initProject(dir, "dev");
    const pkg = JSON.parse(read(dir, "package.json"));
    expect(pkg.scripts).toEqual({ dev: "tsx watch src/server.ts", "dev:trace": "tracedye dev -- npm run dev" });
    expect(read(dir, ".gitignore")).toBe(".tracedye/\n");
    expect(result.changes).toHaveLength(2);
  });

  it("keeps the file's indentation and trailing newline", () => {
    const tabs = project('{\n\t"scripts": {\n\t\t"dev": "x"\n\t}\n}\n');
    initProject(tabs, "dev");
    expect(read(tabs, "package.json")).toMatch(/^\{\n\t"scripts": \{\n\t\t"dev": "x",\n\t\t"dev:trace"/);
    expect(read(tabs, "package.json").endsWith("}\n")).toBe(true);
  });

  it("changes nothing the second time", () => {
    const dir = project('{"scripts":{"dev":"x"}}');
    initProject(dir, "dev");
    const first = [read(dir, "package.json"), read(dir, ".gitignore")];
    const second = initProject(dir, "dev");
    expect([read(dir, "package.json"), read(dir, ".gitignore")]).toEqual(first);
    expect(second.changes).toEqual([]);
  });

  it("never overwrites an existing dev:trace", () => {
    const dir = project('{"scripts":{"dev":"x","dev:trace":"mine"}}');
    const result = initProject(dir, "dev");
    expect(JSON.parse(read(dir, "package.json")).scripts["dev:trace"]).toBe("mine");
    expect(result.notes.join()).toMatch(/already exists/);
  });

  it("appends to an existing .gitignore, even without a final newline", () => {
    const dir = project('{"scripts":{"dev":"x"}}', "node_modules");
    initProject(dir, "dev");
    expect(read(dir, ".gitignore")).toBe("node_modules\n.tracedye/\n");
  });

  it("does not repeat .tracedye/ when it is already ignored", () => {
    const dir = project('{"scripts":{"dev":"x"}}', "node_modules\n.tracedye/\n");
    initProject(dir, "dev");
    expect(read(dir, ".gitignore")).toBe("node_modules\n.tracedye/\n");
  });

  it("uses the script you name", () => {
    const dir = project('{"scripts":{"start":"tsx a.ts"}}');
    initProject(dir, "start");
    expect(JSON.parse(read(dir, "package.json")).scripts["dev:trace"]).toBe("tracedye dev -- npm run start");
  });

  it("explains when there is no package.json or no such script, and writes nothing", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "tracedye-init-"));
    dirs.push(empty);
    expect(() => initProject(empty, "dev")).toThrow(/No package\.json/);
    const dir = project('{"scripts":{"build":"x"}}');
    expect(() => initProject(dir, "dev")).toThrow(/No "dev" script/);
    expect(read(dir, "package.json")).toBe('{"scripts":{"build":"x"}}');
  });
});
