#!/usr/bin/env node
// The CLI is TypeScript; tsx runs it, so there is no build step.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
