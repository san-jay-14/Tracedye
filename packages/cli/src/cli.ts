import { USAGE, parseArgs } from "./args";
import { dev } from "./dev";
import { initProject } from "./init";

const parsed = parseArgs(process.argv.slice(2));

if (parsed.kind === "help") {
  console.log(USAGE);
} else if (parsed.kind === "error") {
  console.error(`tracedye: ${parsed.message}\n\nRun "tracedye help" for usage.`);
  process.exitCode = 1;
} else if (parsed.kind === "init") {
  try {
    const { changes, notes } = initProject(parsed.options.dir, parsed.options.script);
    for (const change of changes) console.log(`+ ${change}`);
    for (const note of notes) console.log(`  ${note}`);
    console.log("\nNext: npm install --save-dev tracedye, then npm run dev:trace");
  } catch (error) {
    console.error(`tracedye: ${(error as Error).message}`);
    process.exitCode = 1;
  }
} else {
  try {
    process.exitCode = await dev(parsed.options);
    process.exit();
  } catch (error) {
    console.error(`[tracedye] error: ${(error as Error).message}`);
    process.exit(1);
  }
}
