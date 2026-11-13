import { describe, expect, it } from "vitest";
import { parseArgs } from "./args";

describe("parseArgs: dev", () => {
  it("takes the command after -- and uses the defaults", () => {
    const parsed = parseArgs(["dev", "--", "tsx", "src/server.ts"]);
    expect(parsed).toMatchObject({
      kind: "dev",
      options: { port: 4318, dashboardPort: 5174, tsconfig: "tsconfig.json", dashboard: true, otel: true, index: true, open: false, command: ["tsx", "src/server.ts"] },
    });
  });

  it("reads every option", () => {
    const parsed = parseArgs([
      "dev", "--dir", "app", "--tsconfig", "server/tsconfig.json", "--data-dir", "data", "--arm", "user login", "--port", "0", "--dashboard-port", "6000",
      "--no-dashboard", "--no-otel", "--no-index", "--open", "--", "npm", "run", "dev",
    ]);
    expect(parsed).toMatchObject({
      kind: "dev",
      options: { dir: "app", tsconfig: "server/tsconfig.json", dataDir: "data", arm: "user login", port: 0, dashboardPort: 6000, dashboard: false, otel: false, index: false, open: true, command: ["npm", "run", "dev"] },
    });
  });

  it("keeps the app's own flags: everything after -- is the command", () => {
    const parsed = parseArgs(["dev", "--", "tsx", "src/server.ts", "--port", "3000", "--no-otel"]);
    expect(parsed).toMatchObject({ kind: "dev", options: { otel: true, port: 4318, command: ["tsx", "src/server.ts", "--port", "3000", "--no-otel"] } });
  });

  it.each([
    ["no command", ["dev"]],
    ["an empty command", ["dev", "--"]],
    ["an unknown option", ["dev", "--wat", "--", "tsx", "a.ts"]],
    ["a port that is not a number", ["dev", "--port", "abc", "--", "tsx", "a.ts"]],
    ["a port out of range", ["dev", "--port", "70000", "--", "tsx", "a.ts"]],
    ["an option missing its value", ["dev", "--tsconfig"]],
  ])("rejects %s", (_name, argv) => {
    expect(parseArgs(argv).kind).toBe("error");
  });
});

describe("parseArgs: other commands", () => {
  it("parses init", () => {
    expect(parseArgs(["init"])).toMatchObject({ kind: "init", options: { script: "dev" } });
    expect(parseArgs(["init", "--dir", "x", "--script", "start"])).toMatchObject({ kind: "init", options: { dir: "x", script: "start" } });
    expect(parseArgs(["init", "--bad"]).kind).toBe("error");
  });

  it("shows help for nothing, help and --help", () => {
    for (const argv of [[], ["help"], ["--help"], ["-h"]]) expect(parseArgs(argv).kind).toBe("help");
  });

  it("rejects an unknown command", () => {
    expect(parseArgs(["launch"]).kind).toBe("error");
  });
});
