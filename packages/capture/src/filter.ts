import path from "node:path";

const EXCLUDED_SEGMENTS = ["node_modules", "__tests__", "generated"];

// True for TypeScript files under projectDir that are real project code:
// not dependencies, tests, declaration files or generated files.
export function isProjectSource(filePath: string, projectDir: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);

  const relative = path.posix.relative(projectDir.replaceAll("\\", "/"), normalized);
  if (relative.startsWith("..") || path.posix.isAbsolute(relative)) return false;

  if (!/\.m?ts$/.test(base) || base.endsWith(".d.ts")) return false;
  if (/\.(test|spec|generated)\./.test(base)) return false;
  return !relative.split("/").some((segment) => EXCLUDED_SEGMENTS.includes(segment));
}
