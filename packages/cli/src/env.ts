export interface Preloads {
  start: string; // file URL of the one preload added to NODE_OPTIONS
  captureRegister: string;
  captureForward: string;
  otel: string;
}

// The environment for the user's command. NODE_OPTIONS reaches every node process it starts
// (tsx, watchers, the app itself), which is how capture gets in without touching the project.
export function buildChildEnv(input: {
  base: NodeJS.ProcessEnv;
  collectorUrl: string;
  preloads: Preloads;
  otel: boolean;
}): NodeJS.ProcessEnv {
  const options = [input.base.NODE_OPTIONS, `--import ${input.preloads.start}`].filter(Boolean).join(" ");
  return {
    ...input.base,
    NODE_OPTIONS: options,
    NODE_ENV: input.base.NODE_ENV ?? "development",
    DFD_COLLECTOR_URL: input.collectorUrl,
    DFD_CAPTURE_REGISTER: input.preloads.captureRegister,
    DFD_CAPTURE_FORWARD: input.preloads.captureForward,
    DFD_OTEL_PRELOAD: input.preloads.otel,
    DFD_OTEL: input.otel ? "1" : "0",
  };
}

// One shell string from the words after "--", quoting the ones that need it.
export function toShellCommand(words: string[]): string {
  return words.map((word) => (/[\s"]/.test(word) ? `"${word.replace(/"/g, '\\"')}"` : word)).join(" ");
}
