import { describe, expect, it } from "vitest";
import { buildChildEnv, toShellCommand } from "./env";

const preloads = { start: "file:///x/start.mjs", captureRegister: "file:///x/register.js", captureForward: "file:///x/forward.js", otel: "file:///x/otel.mjs" };

describe("buildChildEnv", () => {
  it("adds the preload to NODE_OPTIONS without losing the user's own options", () => {
    const env = buildChildEnv({ base: { NODE_OPTIONS: "--max-old-space-size=4096" }, collectorUrl: "http://localhost:4318", preloads, otel: true });
    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=4096 --import file:///x/start.mjs");
  });

  it("works when NODE_OPTIONS was not set", () => {
    expect(buildChildEnv({ base: {}, collectorUrl: "u", preloads, otel: true }).NODE_OPTIONS).toBe("--import file:///x/start.mjs");
  });

  it("tells the preload where everything is", () => {
    const env = buildChildEnv({ base: {}, collectorUrl: "http://localhost:4999", preloads, otel: false });
    expect(env).toMatchObject({
      TRACEDYE_COLLECTOR_URL: "http://localhost:4999",
      TRACEDYE_CAPTURE_REGISTER: preloads.captureRegister,
      TRACEDYE_CAPTURE_FORWARD: preloads.captureForward,
      TRACEDYE_OTEL_PRELOAD: preloads.otel,
      TRACEDYE_OTEL: "0",
    });
  });

  it("defaults NODE_ENV to development but never overrides it", () => {
    expect(buildChildEnv({ base: {}, collectorUrl: "u", preloads, otel: true }).NODE_ENV).toBe("development");
    expect(buildChildEnv({ base: { NODE_ENV: "test" }, collectorUrl: "u", preloads, otel: true }).NODE_ENV).toBe("test");
  });

  it("keeps the rest of the environment", () => {
    expect(buildChildEnv({ base: { PATH: "/bin", FOO: "1" }, collectorUrl: "u", preloads, otel: true })).toMatchObject({ PATH: "/bin", FOO: "1" });
  });
});

describe("toShellCommand", () => {
  it("joins plain words with spaces", () => {
    expect(toShellCommand(["tsx", "src/server.ts"])).toBe("tsx src/server.ts");
  });

  it("quotes words with spaces and escapes quotes", () => {
    expect(toShellCommand(["C:\\Program Files\\node.exe", "a.ts", 'say "hi"'])).toBe('"C:\\Program Files\\node.exe" a.ts "say \\"hi\\""');
  });
});
