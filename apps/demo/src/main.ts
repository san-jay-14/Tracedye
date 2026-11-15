import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDemoServer } from "./server";
import { createSimulator } from "./simulate";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 7860); // Hugging Face Spaces expects 7860
const collectorUrl = process.env.COLLECTOR_URL ?? "http://127.0.0.1:4318";
const sampleUrl = process.env.SAMPLE_URL ?? "http://127.0.0.1:3001";
const dashboardDir = process.env.DASHBOARD_DIR ?? path.resolve(here, "../../dashboard/dist");

const log = (message: string) => console.log(`[demo] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The demo logs in once by itself when the app is up, so the first visitor sees a captured
// request straight away instead of an empty page.
async function seed(simulate: () => Promise<{ ok: boolean }>): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const state = (await (await fetch(`${collectorUrl}/state`)).json()) as { armed: string | null };
      await fetch(sampleUrl); // any answer means the app is listening
      if (state.armed) {
        await sleep(1500); // the app follows the armed state by polling
        const result = await simulate();
        log(result.ok ? "ran the first login" : "the first login did not go through");
        return;
      }
    } catch {
      // not up yet
    }
    await sleep(2000);
  }
  log("gave up waiting for the app to start");
}

const simulator = createSimulator({ sampleUrl, email: "demo@example.com", password: "demo-password" });
const server = await startDemoServer({ dashboardDir, port, collectorUrl, simulator });
log(`listening on port ${server.port}`);
void seed(() => simulator.simulate());
