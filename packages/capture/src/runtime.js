// Plain JavaScript (types in JSDoc, checked by tsc): loaded from register.js, which
// Node runs as a preload before TypeScript support is available on Node 20.
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import diagnosticsChannel from "node:diagnostics_channel";
import { performance } from "node:perf_hooks";

/**
 * Deliberately carries no arguments or return values: payload capture arrives
 * with redaction (Day 6), so nothing sensitive can leave through these events.
 * @typedef {object} FunctionEvent
 * @property {"enter" | "exit"} phase
 * @property {string} triggerId the trigger instance this call belongs to
 * @property {string} nodeId "file:name:line", the same id the indexer produces
 * @property {string} spanId
 * @property {string} [parentId]
 * @property {number} atMs
 * @property {number} [durationMs] exit only
 * @property {boolean} [threw] exit only
 */

/**
 * @typedef {object} TriggerContext
 * @property {string} triggerId
 * @property {string} [spanId] the innermost wrapped call currently running
 */

/** @type {Array<(event: FunctionEvent) => void>} */
const listeners = [];
/** @type {AsyncLocalStorage<TriggerContext | undefined>} */
const context = new AsyncLocalStorage();
let nextSpan = 0;

/** Name of the armed trigger, or null. Wrappers do nothing while this is null. @type {string | null} */
let armedName = null;

/** @param {(event: FunctionEvent) => void} listener */
export function onEvent(listener) {
  listeners.push(listener);
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
  return context.run({ triggerId }, fn);
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
    context.enterWith({ triggerId: supplied ?? mintTriggerId(armedName) });
  });
}

/** @param {FunctionEvent} event */
function emit(event) {
  for (const listener of listeners) listener(event);
}

/** @param {unknown} value @returns {value is Promise<unknown>} */
function isPromise(value) {
  return typeof (/** @type {{ then?: unknown } | undefined} */ (value))?.then === "function";
}

/**
 * Wraps fn so that, while a trigger is armed and the call is inside one, it emits
 * enter and exit events. Otherwise it only calls fn.
 * @template {(...args: any[]) => any} T
 * @param {string} nodeId
 * @param {T} fn
 * @returns {T}
 */
export function wrapFunction(nodeId, fn) {
  /** @this {unknown} @param {unknown[]} args */
  const wrapped = function (...args) {
    if (armedName === null) return fn.apply(this, args);
    const current = context.getStore();
    if (!current) return fn.apply(this, args);

    const { triggerId } = current;
    const spanId = String(++nextSpan);
    const parentId = current.spanId;
    const start = performance.now();
    emit({ phase: "enter", triggerId, nodeId, spanId, parentId, atMs: start });

    /** @param {boolean} [threw] */
    const finish = (threw) => {
      const end = performance.now();
      emit({ phase: "exit", triggerId, nodeId, spanId, parentId, atMs: end, durationMs: end - start, threw });
    };

    /** @type {unknown} */
    let result;
    try {
      result = context.run({ triggerId, spanId }, () => fn.apply(this, args));
    } catch (error) {
      finish(true);
      throw error;
    }
    if (isPromise(result)) {
      return result.then(
        (value) => {
          finish();
          return value;
        },
        (error) => {
          finish(true);
          throw error;
        },
      );
    }
    finish();
    return result;
  };

  Object.defineProperty(wrapped, "name", { value: fn.name });
  Object.defineProperty(wrapped, "length", { value: fn.length });
  return /** @type {T} */ (/** @type {unknown} */ (wrapped));
}

// Transformed project code calls this global, so it needs no import and
// the loader hook (which runs on another thread) never has to share state.
globalThis.__captureWrap = wrapFunction;
