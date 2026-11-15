import { describe, expect, it } from "vitest";
import { BACKEND, abstractGraph, buildHierarchy, expandedFor, levelOf, visibleId } from "./abstraction";
import { loginMap, login } from "./fixtures";
import { buildGraph } from "./graph";

const graph = buildGraph(loginMap, login);
const h = buildHierarchy(graph.nodes, graph.edges);
const edgeOf = (g: ReturnType<typeof abstractGraph>, id: string) => g.edges.find((e) => e.id === id);

describe("buildHierarchy", () => {
  it("puts the functions a route reaches in that route's API", () => {
    const api = h.groupOf.get("handleLogin");
    expect(api).toBe(h.groupOf.get("POST /login"));
    expect(h.groups.get(api as string)).toMatchObject({ label: "POST /login", parent: BACKEND });
  });

  it("leaves the browser, stores and model out of every group", () => {
    for (const id of ["client", "postgres", "redis", "llm"]) expect(h.groupOf.has(id)).toBe(false);
  });

  it("puts code reachable from two routes in shared code, not in either API", () => {
    const nodes = [
      { id: "GET /a", kind: "app", label: "GET /a" },
      { id: "GET /b", kind: "app", label: "GET /b" },
      { id: "util", kind: "app", label: "util" },
      { id: "onlyA", kind: "app", label: "onlyA" },
    ];
    const edges = [
      { from: "GET /a", to: "util" },
      { from: "GET /b", to: "util" },
      { from: "GET /a", to: "onlyA" },
    ];
    const hierarchy = buildHierarchy(nodes, edges);
    expect(hierarchy.groupOf.get("util")).toBe("group:shared");
    expect(hierarchy.groupOf.get("onlyA")).toBe(hierarchy.groupOf.get("GET /a"));
  });

  it("groups everything as backend code when there are no routes", () => {
    const hierarchy = buildHierarchy([{ id: "f", kind: "app", label: "f" }], []);
    expect(hierarchy.groups.get(hierarchy.groupOf.get("f") as string)?.label).toBe("Backend code");
  });
});

describe("abstractGraph", () => {
  it("shows the backend as one box at the system level", () => {
    const system = abstractGraph(graph, h, expandedFor(h, "system"));
    expect(system.nodes.map((n) => n.label).sort()).toEqual(["Backend", "LLM", "Postgres", "React client", "Redis"].sort());
    expect(system.nodes.find((n) => n.id === BACKEND)?.container?.caption).toBe("1 API · 6 functions");
  });

  it("opens the backend into its APIs", () => {
    const apis = abstractGraph(graph, h, expandedFor(h, "apis"));
    expect(apis.nodes.map((n) => n.label)).toContain("POST /login");
    expect(apis.nodes.find((n) => n.label === "POST /login")?.container?.caption).toBe("6 functions");
  });

  it("shows every function at the function level, with no boxes", () => {
    const all = abstractGraph(graph, h, expandedFor(h, "functions"));
    expect(all.nodes.length).toBe(graph.nodes.length);
    expect(all.nodes.some((n) => n.container)).toBe(false);
    expect(all.edges.length).toBe(graph.edges.length);
  });

  it("drops calls inside a box and joins the calls that leave it", () => {
    const system = abstractGraph(graph, h, new Set());
    expect(system.edges.map((e) => e.id).sort()).toEqual(
      ["client->group:backend", "group:backend->llm", "group:backend->postgres", "group:backend->redis", "group:backend->client"].sort(),
    );
  });

  it("marks a joined edge observed only if a call across it was observed", () => {
    const observed = abstractGraph(graph, h, new Set());
    expect(edgeOf(observed, "group:backend->postgres")?.provenance).toBe("observed");

    const staticOnly = buildGraph(loginMap, []);
    const quiet = abstractGraph(staticOnly, h, new Set());
    expect(quiet.edges.length).toBeGreaterThan(0);
    expect(quiet.edges.every((e) => e.provenance === "static")).toBe(true);
  });

  it("calls a box seen only if something inside it ran", () => {
    expect(abstractGraph(buildGraph(loginMap, []), h, new Set()).nodes.find((n) => n.id === BACKEND)?.seen).toBe(false);
    expect(abstractGraph(graph, h, new Set()).nodes.find((n) => n.id === BACKEND)?.seen).toBe(true);
  });
});

describe("opening one box at a time", () => {
  it("maps a function to the box that currently stands for it", () => {
    expect(visibleId(h, new Set(), "validate")).toBe(BACKEND);
    expect(visibleId(h, new Set([BACKEND]), "validate")).toBe(h.groupOf.get("validate"));
    expect(visibleId(h, expandedFor(h, "functions"), "validate")).toBe("validate");
    expect(visibleId(h, new Set(), "postgres")).toBe("postgres");
  });

  it("names the preset a set of open boxes matches", () => {
    expect(levelOf(h, new Set())).toBe("system");
    expect(levelOf(h, new Set([BACKEND]))).toBe("apis");
    expect(levelOf(h, expandedFor(h, "functions"))).toBe("functions");
    expect(levelOf(h, new Set(["group:other"]))).toBeUndefined();
  });
});
