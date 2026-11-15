// Stages a folder that can be pushed to a Hugging Face Space: the repo's tracked files, the Dockerfile
// at the top (where Spaces look for it), and the Space's README with its settings.
//   node deploy/huggingface/prepare.mjs
// Commit your work first: only files git tracks are copied.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const space = path.join(here, "space");

rmSync(space, { recursive: true, force: true });
mkdirSync(space, { recursive: true });

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of tracked) {
  const from = path.join(repo, file);
  const to = path.join(space, file);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}

cpSync(path.join(repo, "deploy/Dockerfile"), path.join(space, "Dockerfile"));
cpSync(path.join(here, "README.md"), path.join(space, "README.md"));

console.log(`Staged ${tracked.length} files in ${path.relative(process.cwd(), space) || space}`);
console.log("Next: see docs/DEPLOY.md, step 3.");
