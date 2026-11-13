import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexProject } from "./index";

const repoRoot = path.resolve(__dirname, "../../..");
const server = "apps/sample-app/server";
const map = indexProject(path.join(repoRoot, server, "tsconfig.json"), repoRoot);

const nodeId = (label: string) => {
  const node = map.nodes.find((n) => n.label === label);
  if (!node) throw new Error(`no node labelled ${label}`);
  return node.id;
};
const hasEdge = (from: string, to: string) => map.edges.some((e) => e.from === from && e.to === to);

describe("indexProject on the sample app", () => {
  it("lists the login functions with file and line", () => {
    for (const name of ["handleLogin", "validateCredentials", "enrichProfile", "createSession", "notifyClient"]) {
      expect(nodeId(name)).toMatch(new RegExp(`^${server}/login\\.ts:${name}:\\d+$`));
    }
  });

  it("finds the main login call chain", () => {
    const login = nodeId("handleLogin");
    expect(hasEdge("POST /login", login)).toBe(true);
    for (const name of ["validateCredentials", "enrichProfile", "createSession", "notifyClient"]) {
      expect(hasEdge(login, nodeId(name))).toBe(true);
    }
  });

  it("links functions to Postgres, Redis and the LLM", () => {
    expect(hasEdge(nodeId("validateCredentials"), "postgres")).toBe(true);
    expect(hasEdge(nodeId("createSession"), "redis")).toBe(true);
    expect(hasEdge(nodeId("enrichProfile"), nodeId("classifySegment"))).toBe(true);
    expect(hasEdge(nodeId("classifySegment"), "llm")).toBe(true);
  });

  it("keeps sendWelcomeEmail with no incoming edges", () => {
    const email = nodeId("sendWelcomeEmail");
    expect(map.edges.some((e) => e.to === email)).toBe(false);
  });

  it("maps only the project's own files, not workspace packages it imports", () => {
    expect(map.nodes.every((n) => !n.file || n.file.startsWith(`${server}/`))).toBe(true);
  });

  it("marks every edge static", () => {
    expect(map.edges.length).toBeGreaterThan(0);
    expect(map.edges.every((e) => e.provenance === "static")).toBe(true);
  });
});
