// The one preload `tracedye dev` adds to NODE_OPTIONS. It runs in every node process the command
// starts, so it first skips the tooling ones (package managers, the tsx launcher) and only
// loads capture in the process that runs your code.
const entry = process.argv[1] ?? "";
const isTooling = /[\/](pnpm|npm|yarn|corepack|npx)[\/]|npm-cli|pnpm\.c?js|yarn\.js|[\/]tsx[\/]dist[\/]cli/.test(entry);

if (!isTooling && process.env.TRACEDYE_CAPTURE_REGISTER) {
  await import(process.env.TRACEDYE_CAPTURE_REGISTER);
  await import(process.env.TRACEDYE_CAPTURE_FORWARD);
  if (process.env.TRACEDYE_OTEL === "1") await import(process.env.TRACEDYE_OTEL_PRELOAD);
}
