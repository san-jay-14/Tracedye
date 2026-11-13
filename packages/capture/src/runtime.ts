import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

// Deliberately carries no arguments or return values: payload capture arrives
// with redaction (Day 6), so nothing sensitive can leave through these events.
export interface FunctionEvent {
  phase: "enter" | "exit";
  nodeId: string; // "file:name:line", the same id the indexer produces
  spanId: string;
  parentId?: string;
  atMs: number;
  durationMs?: number; // exit only
  threw?: boolean; // exit only
}

type Listener = (event: FunctionEvent) => void;

const listeners: Listener[] = [];
const currentSpan = new AsyncLocalStorage<string>();
let nextSpan = 0;

export function onEvent(listener: Listener): void {
  listeners.push(listener);
}

function emit(event: FunctionEvent): void {
  for (const listener of listeners) listener(event);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as Promise<unknown> | undefined)?.then === "function";
}

export function wrapFunction<T extends (...args: any[]) => any>(nodeId: string, fn: T): T {
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const spanId = String(++nextSpan);
    const parentId = currentSpan.getStore();
    const start = performance.now();
    emit({ phase: "enter", nodeId, spanId, parentId, atMs: start });

    const finish = (threw?: boolean) => {
      const end = performance.now();
      emit({ phase: "exit", nodeId, spanId, parentId, atMs: end, durationMs: end - start, threw });
    };

    let result: unknown;
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
  return wrapped as unknown as T;
}

// Transformed project code calls this global, so it needs no import and
// the loader hook (which runs on another thread) never has to share state.
declare global {
  var __captureWrap: typeof wrapFunction;
}
globalThis.__captureWrap = wrapFunction;
