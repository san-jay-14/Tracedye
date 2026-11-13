import { USAGE, parseArgs } from "./args";
import { dev } from "./dev";
import { initProject } from "./init";

const parsed = parseArgs(process.argv.slice(2));

if (parsed.kind === "help") {
  console.log(USAGE);
} else if (parsed.kind === "error") {
  console.error(`dfd: ${parsed.message}\n\nRun "dfd help" for usage.`);
  process.exitCode = 1;
} else if (parsed.kind === "init") {
  try {
    const { changes, notes } = initProject(parsed.options.dir, parsed.options.script);
    for (const change of changes) console.log(`+ ${change}`);
    for (const note of notes) console.log(`  ${note}`);
    console.log(`\nNext: npm run dev:trace   (dfd must be on your PATH: run "pnpm link --global" in packages/cli of the debugger repo)`);
  } catch (error) {
    console.error(`dfd: ${(error as Error).message}`);
    process.exitCode = 1;
  }
} else {
  try {
    process.exitCode = await dev(parsed.options);
    process.exit();
  } catch (error) {
    console.error(`[dfd] error: ${(error as Error).message}`);
    process.exit(1);
  }
}
