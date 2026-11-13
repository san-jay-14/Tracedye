import { boundary } from "../src/index";
import type { CaptureSpanProcessor } from "../src/otel.js";

// Each has two statements, so none is "trivial" and all get wrapped.
export function askModel(prompt: string) {
  const reply = boundary("llm", "llm", () => `echo:${prompt}`, { note: "stub" });
  return reply;
}

export function push(message: string) {
  const sent = boundary("ws", "client", () => message.length);
  return sent;
}

export function tagSpan(processor: CaptureSpanProcessor, span: { setAttributes(attributes: Record<string, string | number>): void }) {
  processor.onStart(span);
  return true;
}
