// Plain JavaScript (types in JSDoc, checked by tsc): loaded from register.js, which
// Node runs as a preload before TypeScript support is available on Node 20.
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

/**
 * Deliberately carries no arguments or return values: payload capture arrives
 * with redaction (Day 6), so nothing sensitive can leave through these events.
 * @typedef {object} FunctionEvent
 * @property {"enter" | "exit"} phase
 * @property {string} nodeId "file:name:line", the same id the indexer produces
 * @property {string} spanId
 * @property {string} [parentId]
 * @property {number} atMs
 * @property {number} [durationMs] exit only
 * @property {boolean} [threw] exit only
 */

/** @type {Array<(event: FunctionEvent) => void>} */
const listeners = [];
/** @type {AsyncLocalStorage<string>} */
const currentSpan = new AsyncLocalStorage();
let nextSpan = 0;

/** @param {(event: FunctionEvent) => void} listener */
export function onEvent(listener) {
  listeners.push(listener);
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
 * @template {(...args: any[]) => any} T
 * @param {string} nodeId
 * @param {T} fn
 * @returns {T}
 */
export function wrapFunction(nodeId, fn) {
  /** @this {unknown} @param {unknown[]} args */
  const wrapped = function (...args) {
    const spanId = String(++nextSpan);
    const parentId = currentSpan.getStore();
    const start = performance.now();
    emit({ phase: "enter", nodeId, spanId, parentId, atMs: start });

    /** @param {boolean} [threw] */
    const finish = (threw) => {
      const end = performance.now();
      emit({ phase: "exit", nodeId, spanId, parentId, atMs: end, durationMs: end - start, threw });
    };

    /** @type {unknown} */
    let result;
    try {
      result = currentSpan.run(spanId, () => fn.apply(this, args));
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
