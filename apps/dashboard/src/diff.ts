export type DiffStatus = "same" | "added" | "removed" | "changed";

export interface DiffRow {
  path: string;
  status: DiffStatus;
  before?: unknown;
  after?: unknown;
}

// Flattens a payload to path -> leaf value ("user.plan", "items[0]"). A value that is not
// an object at the top is shown as "(value)".
function leaves(value: unknown, path = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (current: unknown, at: string) => {
    if (current === undefined) return; // no value at all, as when a function returns nothing
    if (Array.isArray(current) && current.length > 0) current.forEach((item, i) => walk(item, `${at}[${i}]`));
    else if (isObject(current) && Object.keys(current).length > 0) {
      for (const [key, item] of Object.entries(current)) walk(item, at === "" ? key : `${at}.${key}`);
    } else out.set(at === "" ? "(value)" : at, current);
  };
  walk(value, path);
  return out;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Compares what went into a hop with what came out: fields that are only in "before" were
// removed, only in "after" were added, and fields in both are changed or the same.
export function diffPayload(before: unknown, after: unknown): DiffRow[] {
  const a = leaves(before);
  const b = leaves(after);
  const rows: DiffRow[] = [];
  for (const [path, value] of a) {
    if (!b.has(path)) rows.push({ path, status: "removed", before: value });
    else if (JSON.stringify(value) === JSON.stringify(b.get(path))) rows.push({ path, status: "same", before: value, after: b.get(path) });
    else rows.push({ path, status: "changed", before: value, after: b.get(path) });
  }
  for (const [path, value] of b) if (!a.has(path)) rows.push({ path, status: "added", after: value });
  return rows;
}
