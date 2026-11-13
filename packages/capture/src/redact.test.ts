import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, REDACTED, redact } from "./redact.js";

describe("redact: deny list", () => {
  it("replaces denied keys at any depth, ignoring case", () => {
    const input = { user: { Password: "p1", profile: { API_TOKEN: "t1", name: "Ann" } }, list: [{ secret: "s1", ok: 1 }] };
    expect(redact(input)).toEqual({
      user: { Password: REDACTED, profile: { API_TOKEN: REDACTED, name: "Ann" } },
      list: [{ secret: REDACTED, ok: 1 }],
    });
  });

  it.each(["password_hash", "accessToken", "Authorization", "set-cookie", "client_secret", "x-auth-token"])(
    "catches %s as a substring match",
    (key) => {
      expect(redact({ [key]: "value" })).toEqual({ [key]: REDACTED });
    },
  );

  it("redacts the whole value of a denied key, even an object", () => {
    expect(redact({ token: { a: 1, b: "x" } })).toEqual({ token: REDACTED });
  });

  it("applies extra configured keys", () => {
    const options = { ...DEFAULT_OPTIONS, denyKeys: [...DEFAULT_OPTIONS.denyKeys, "ssn"] };
    expect(redact({ ssn: "123-45-6789", name: "Ann" }, options)).toEqual({ ssn: REDACTED, name: "Ann" });
  });

  it("keeps non-secret values", () => {
    expect(redact({ email: "a@b.c", count: 3, ok: true, none: null })).toEqual({
      email: "a@b.c",
      count: 3,
      ok: true,
      none: null,
    });
  });
});

describe("redact: what it will not open", () => {
  it("replaces class instances with a placeholder, so unkeyed secrets inside them can't leak", () => {
    class FakeRequest {
      rawHeaders = ["Authorization", "Bearer abc123"];
      body = { password: "hunter2" };
    }
    const result = redact({ req: new FakeRequest() });
    expect(result).toEqual({ req: "[FakeRequest]" });
    expect(JSON.stringify(result)).not.toContain("abc123");
  });

  it("replaces Map, Set, Buffer and errors with placeholders", () => {
    expect(redact([new Map([["k", "v"]]), new Set(["s"]), Buffer.from("secret-bytes"), new Error("boom pw=1")])).toEqual([
      "[Map]",
      "[Set]",
      "[Buffer]",
      "[Error: Error]",
    ]);
  });

  it("handles circular references", () => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    expect(redact(loop)).toEqual({ name: "a", self: "[Circular]" });
  });

  it("stops at a maximum depth", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 10; i++) deep = { next: deep };
    expect(JSON.stringify(redact(deep))).toContain("[MaxDepth]");
  });

  it("survives a throwing getter", () => {
    const value = {
      get boom(): string {
        throw new Error("nope");
      },
      fine: 1,
    };
    expect(redact(value)).toEqual({ boom: "[Unreadable]", fine: 1 });
  });

  it("treats __proto__ as a plain key", () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const result = redact(parsed) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = { password: "p", nested: { token: "t" } };
    redact(input);
    expect(input).toEqual({ password: "p", nested: { token: "t" } });
  });
});

describe("redact: size cap", () => {
  const options = { ...DEFAULT_OPTIONS, maxBytes: 100 };

  it("passes values under the cap through unchanged", () => {
    expect(redact({ a: "small" }, options)).toEqual({ a: "small" });
  });

  it("truncates a value over the cap and says how big it was", () => {
    const result = redact({ list: Array.from({ length: 50 }, (_, i) => `item-${i}`) }, options) as string;
    expect(typeof result).toBe("string");
    expect(result).toMatch(/…\[truncated, \d+ bytes\]$/);
    expect(Buffer.byteLength(result.split("…[truncated")[0])).toBeLessThanOrEqual(100);
  });

  it("truncates one huge string", () => {
    expect(redact("x".repeat(10_000), options)).toMatch(/\[truncated, \d+ bytes\]$/);
  });

  it("limits very long arrays and wide objects", () => {
    const result = redact(Array.from({ length: 1000 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(101);
    expect(result.at(-1)).toBe("[900 more]");
  });

  it("applies the 4 KB default", () => {
    expect(DEFAULT_OPTIONS.maxBytes).toBe(4096);
  });
});
