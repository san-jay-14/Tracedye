// Plain JavaScript (types in JSDoc, checked by tsc), see runtime.js.
// Everything leaving the process goes through redact(): it deny-lists keys, walks only
// plain objects and arrays, and caps the size. It never mutates its input.

export const REDACTED = "[REDACTED]";
export const DEFAULT_DENY_KEYS = ["password", "token", "authorization", "cookie", "secret"];
export const DEFAULT_MAX_BYTES = 4096;

const MAX_DEPTH = 6;
const MAX_ENTRIES = 100;

/**
 * @typedef {object} RedactOptions
 * @property {string[]} denyKeys lower-case; a key is denied if it contains any of these
 * @property {number} maxBytes cap on one redacted value
 */

/** @type {RedactOptions} */
export const DEFAULT_OPTIONS = { denyKeys: DEFAULT_DENY_KEYS, maxBytes: DEFAULT_MAX_BYTES };

/**
 * @param {string} key
 * @param {string[]} denyKeys
 */
export function isDeniedKey(key, denyKeys) {
  const lower = key.toLowerCase();
  return denyKeys.some((denied) => lower.includes(denied));
}

/**
 * Returns a JSON-safe copy of value with denied keys replaced and the size capped.
 * @param {unknown} value
 * @param {RedactOptions} [options]
 * @returns {unknown}
 */
export function redact(value, options = DEFAULT_OPTIONS) {
  const result = walk(value, options, 0, new WeakSet());
  const json = JSON.stringify(result);
  if (json === undefined) return result;
  const bytes = Buffer.byteLength(json);
  if (bytes <= options.maxBytes) return result;
  const preview = Buffer.from(json).subarray(0, options.maxBytes).toString("utf8");
  return `${preview}…[truncated, ${bytes} bytes]`;
}

/**
 * @param {unknown} value
 * @param {RedactOptions} options
 * @param {number} depth
 * @param {WeakSet<object>} seen
 * @returns {unknown}
 */
function walk(value, options, depth, seen) {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case "string":
      return value.length > options.maxBytes ? `${value.slice(0, options.maxBytes)}…` : value;
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return `${value}n`;
    case "symbol":
      return value.toString();
    case "function":
      return "[Function]";
  }
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (seen.has(value)) return "[Circular]";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[Invalid Date]" : value.toISOString();

  if (Array.isArray(value)) {
    seen.add(value);
    const items = value.slice(0, MAX_ENTRIES).map((item) => walk(item, options, depth + 1, seen));
    if (value.length > MAX_ENTRIES) items.push(`[${value.length - MAX_ENTRIES} more]`);
    seen.delete(value);
    return items;
  }

  // Class instances (Express res, sockets, ORM models...) can hold secrets under no key at
  // all, such as rawHeaders, so they are never opened. A request is the one exception: it
  // is summarised from a fixed list of fields, each going through the same key deny list.
  if (!isPlainObject(value)) {
    if (constructorName(value) === "IncomingMessage") return walk(summarizeRequest(value), options, depth, seen);
    return `[${constructorName(value)}]`;
  }

  seen.add(value);
  /** @type {Record<string, unknown>} */
  const out = {};
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record);
  for (const key of keys.slice(0, MAX_ENTRIES)) {
    let copy;
    if (isDeniedKey(key, options.denyKeys)) copy = REDACTED;
    else {
      try {
        copy = walk(record[key], options, depth + 1, seen);
      } catch {
        copy = "[Unreadable]";
      }
    }
    // defineProperty, so a key named "__proto__" stays a plain key
    Object.defineProperty(out, key, { value: copy, enumerable: true, writable: true, configurable: true });
  }
  if (keys.length > MAX_ENTRIES) out["…"] = `${keys.length - MAX_ENTRIES} more`;
  seen.delete(value);
  return out;
}

/**
 * Method, path, query, headers, parsed body and client address. The query string is split
 * off the url and parsed, so `?token=abc` is caught by key like any other field.
 * @param {object} value
 */
function summarizeRequest(value) {
  const request = /** @type {{ method?: string, url?: string, headers?: object, body?: unknown, socket?: { remoteAddress?: string } }} */ (
    value
  );
  const [path, queryString = ""] = (request.url ?? "").split("?");
  return {
    method: request.method,
    path,
    query: Object.fromEntries(new URLSearchParams(queryString)),
    headers: { ...request.headers },
    body: request.body,
    ip: request.socket?.remoteAddress,
  };
}

/** @param {object} value */
function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {object} value */
function constructorName(value) {
  return value instanceof Error ? `Error: ${value.name}` : (value.constructor?.name ?? "Object");
}
