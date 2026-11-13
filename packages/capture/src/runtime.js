// Plain JavaScript (types in JSDoc, checked by tsc): loaded from register.js, which
// Node runs as a preload before TypeScript support is available on Node 20.
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import diagnosticsChannel from "node:diagnostics_channel";
import { performance } from "node:perf_hooks";
import { DEFAULT_DENY_KEYS, DEFAULT_MAX_BYTES, REDACTED, isDeniedKey, redact } from "./redact.js";

// Dev-only: refuse to start in production, so this can never run against live traffic.
if (process.env.NODE_ENV === "production") {
  throw new Error("capture refuses to run when NODE_ENV=production");
}

/**
 * One call of a wrapped function. input and output are redacted and size-capped
 * before the event exists, so nothing downstream ever sees the raw values.
 * @typedef {object} FunctionEvent
 * @property {"enter" | "exit"} phase
 * @property {string} triggerId the trigger instance this call belongs to
 * @property {string} triggerName the armed trigger's name, e.g. "user login"
 * @property {string} nodeId "file:name:line", the same id the indexer produces
 * @property {string} spanId
 * @property {string} [parentId]
 * @property {number} atMs
 * @property {unknown} [input] enter only: arguments keyed by parameter name
 * @property {unknown} [output] exit only: the return value
 * @property {number} [durationMs] exit only
 * @property {boolean} [threw] exit only
 */

/**
 * A function called more than COLLAPSE_AFTER times in one trigger is reported once,
 * after the trigger's outermost call returns, instead of once per call.
 * @typedef {object} CollapsedEvent
 * @property {"collapsed"} phase
 * @property {string} triggerId
 * @property {string} triggerName
 * @property {string} nodeId
 * @property {number} calls total calls in the trigger, including the ones that were emitted
 */

/** @typedef {FunctionEvent | CollapsedEvent} CaptureEvent */

/**
 * @typedef {object} TriggerContext
 * @property {string} triggerId
 * @property {string} triggerName
 * @property {string} [spanId] the innermost wrapped call currently running
 */

const COLLAPSE_AFTER = 10;

/** @type {Array<(event: CaptureEvent) => void>} */
const listeners = [];
/** @type {AsyncLocalStorage<TriggerContext | undefined>} */
const context = new AsyncLocalStorage();
let nextSpan = 0;

/** Name of the armed trigger, or null. Wrappers do nothing while this is null. @type {string | null} */
let armedName = null;

/** Calls per function in each running trigger. @type {Map<string, Map<string, number>>} */
const callCounts = new Map();

let redactOptions = { denyKeys: DEFAULT_DENY_KEYS, maxBytes: DEFAULT_MAX_BYTES };

/** @param {(event: CaptureEvent) => void} listener */
export function onEvent(listener) {
  listeners.push(listener);
}

/**
 * Adds keys to the built-in deny list and/or changes the per-value size cap.
 * The built-in keys can't be removed.
 * @param {{ denyKeys?: string[], maxBytes?: number }} options
 */
export function configure(options) {
  redactOptions = {
    denyKeys: [...DEFAULT_DENY_KEYS, ...(options.denyKeys ?? []).map((key) => key.toLowerCase())],
    maxBytes: options.maxBytes ?? redactOptions.maxBytes,
  };
}

/** @param {string} name */
export function arm(name) {
  armedName = name;
}

export function disarm() {
  armedName = null;
}

/**
 * Runs fn inside a trigger. Calls made while armed are tagged with triggerId.
 * @template T
 * @param {string} triggerId
 * @param {() => T} fn
 * @returns {T}
 */
export function runInTrigger(triggerId, fn) {
  return context.run({ triggerId, triggerName: armedName ?? triggerId }, fn);
}

/** The id of the trigger the current call belongs to, if any. @returns {string | undefined} */
export function currentTriggerId() {
  return context.getStore()?.triggerId;
}

/** @param {string} name */
function mintTriggerId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

// Each HTTP request arriving while armed starts a trigger. A caller may supply the
// id in `x-trigger-id`; anything that doesn't look like a plain id is ignored.
// The context is set on every request, so a keep-alive connection never keeps
// the previous request's trigger.
export function installHttpTrigger() {
  diagnosticsChannel.subscribe("http.server.request.start", (message) => {
    if (armedName === null) {
      context.enterWith(undefined);
      return;
    }
    const { request } = /** @type {{ request: import("node:http").IncomingMessage }} */ (message);
    const header = request.headers["x-trigger-id"];
    const supplied = typeof header === "string" && /^[\w.:-]{1,64}$/.test(header) ? header : undefined;
    context.enterWith({ triggerId: supplied ?? mintTriggerId(armedName), triggerName: armedName });
  });
}

// Listeners run outside any trigger. They are project code too, so otherwise the
// functions they call would be wrapped and emit events of their own, forever.
/** @param {CaptureEvent} event */
function emit(event) {
  context.exit(() => {
    for (const listener of listeners) listener(event);
  });
}

/** @param {unknown} value @returns {value is Promise<unknown>} */
function isPromise(value) {
  return typeof (/** @type {{ then?: unknown } | undefined} */ (value))?.then === "function";
}

// Positional arguments have no keys, so they are keyed by parameter name, which lets
// the deny list catch `password` passed as a plain string. A "...name" entry collects
// the rest arguments; extra arguments get "argN".
/**
 * @param {string[]} paramNames
 * @param {unknown[]} args
 */
function namedInput(paramNames, args) {
  /** @type {Record<string, unknown>} */
  const input = {};
  let i = 0;
  for (; i < paramNames.length; i++) {
    const name = paramNames[i];
    if (name.startsWith("...")) {
      input[name.slice(3)] = args.slice(i);
      return input;
    }
    if (i < args.length) input[name] = args[i];
  }
  for (; i < args.length; i++) input[`arg${i}`] = args[i];
  return input;
}

/** @param {string} nodeId */
function nameOf(nodeId) {
  return nodeId.split(":").at(-2) ?? nodeId;
}

// A function called hashPassword or getToken handles secrets, whatever the parameters are
// called or the values look like, so its arguments and return value are all redacted.
/**
 * @param {string} functionName
 * @param {string[]} paramNames
 * @param {unknown[]} args
 */
function redactedInput(functionName, paramNames, args) {
  const input = namedInput(paramNames, args);
  if (!isDeniedKey(functionName, redactOptions.denyKeys)) return redact(input, redactOptions);
  return Object.fromEntries(Object.keys(input).map((key) => [key, REDACTED]));
}

/**
 * @param {string} functionName
 * @param {unknown} output
 */
function redactedOutput(functionName, output) {
  return isDeniedKey(functionName, redactOptions.denyKeys) ? REDACTED : redact(output, redactOptions);
}

// Called when a trigger's outermost call returns: reports and forgets the call counts.
/** @param {string} triggerId @param {string} triggerName */
function flushCollapsed(triggerId, triggerName) {
  const counts = callCounts.get(triggerId);
  callCounts.delete(triggerId);
  if (!counts) return;
  for (const [nodeId, calls] of counts) {
    if (calls > COLLAPSE_AFTER) emit({ phase: "collapsed", triggerId, triggerName, nodeId, calls });
  }
}

/**
 * Wraps fn so that, while a trigger is armed and the call is inside one, it emits
 * enter and exit events. Otherwise it only calls fn.
 * @template {(...args: any[]) => any} T
 * @param {string} nodeId
 * @param {T} fn
 * @param {string[]} [paramNames]
 * @returns {T}
 */
export function wrapFunction(nodeId, fn, paramNames = []) {
  const name = nameOf(nodeId);

  /** @this {unknown} @param {unknown[]} args */
  const wrapped = function (...args) {
    if (armedName === null) return fn.apply(this, args);
    const current = context.getStore();
    if (!current) return fn.apply(this, args);

    const { triggerId, triggerName } = current;
    let counts = callCounts.get(triggerId);
    if (!counts) callCounts.set(triggerId, (counts = new Map()));
    const calls = (counts.get(nodeId) ?? 0) + 1;
    counts.set(nodeId, calls);
    // Counted but not emitted, and no span of its own, so its callees attach to its caller.
    if (calls > COLLAPSE_AFTER) return fn.apply(this, args);

    const spanId = String(++nextSpan);
    const parentId = current.spanId;
    const start = performance.now();
    emit({
      phase: "enter",
      triggerId,
      triggerName,
      nodeId,
      spanId,
      parentId,
      atMs: start,
      input: redactedInput(name, paramNames, args),
    });

    /** @param {{ output?: unknown, threw?: boolean }} outcome */
    const finish = ({ output, threw }) => {
      const end = performance.now();
      emit({
        phase: "exit",
        triggerId,
        triggerName,
        nodeId,
        spanId,
        parentId,
        atMs: end,
        durationMs: end - start,
        output: threw ? undefined : redactedOutput(name, output),
        threw,
      });
      if (parentId === undefined) flushCollapsed(triggerId, triggerName);
    };

    /** @type {unknown} */
    let result;
    try {
      result = context.run({ triggerId, triggerName, spanId }, () => fn.apply(this, args));
    } catch (error) {
      finish({ threw: true });
      throw error;
    }
    if (isPromise(result)) {
      return result.then(
        (value) => {
          finish({ output: value });
          return value;
        },
        (error) => {
          finish({ threw: true });
          throw error;
        },
      );
    }
    finish({ output: result });
    return result;
  };

  Object.defineProperty(wrapped, "name", { value: fn.name || name });
  Object.defineProperty(wrapped, "length", { value: fn.length });
  return /** @type {T} */ (/** @type {unknown} */ (wrapped));
}

// Transformed project code calls this global, so it needs no import and
// the loader hook (which runs on another thread) never has to share state.
globalThis.__captureWrap = wrapFunction;
