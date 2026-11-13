import path from "node:path";
import { indexProject } from "./index";

// Usage: pnpm --filter indexer index <path to tsconfig.json> [root dir]
const tsConfig = path.resolve(process.argv[2] ?? "");
const rootDir = path.resolve(process.argv[3] ?? process.cwd());
console.log(JSON.stringify(indexProject(tsConfig, rootDir), null, 2));
