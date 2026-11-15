import type http from "node:http";
import { startDashboard, type DashboardServer } from "cli/src/dashboard-server";
import type { Simulator } from "./simulate";

// A visitor may read what was captured and watch it live, and press one button. Nothing else reaches
// the collector: no arming, no events, no map, no spans.
export const allowedCollectorRequest = (method: string, target: string): boolean =>
  method === "GET" && (target === "/state" || target === "/triggers" || /^\/triggers\/[^/]+\/events$/.test(target));

const json = (res: http.ServerResponse, status: number, body: unknown) =>
  void res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));

export function startDemoServer(options: {
  dashboardDir: string;
  port: number;
  collectorUrl: string;
  simulator: Simulator;
}): Promise<DashboardServer> {
  return startDashboard({
    dir: options.dashboardDir,
    port: options.port,
    collectorUrl: options.collectorUrl,
    allowCollector: allowedCollectorRequest,
    handle: async (req, res) => {
      const route = (req.url ?? "").split("?")[0];
      // The dashboard asks this on load; only a demo answers it, which is how it knows to show the button.
      if (route === "/demo/config") {
        json(res, 200, { simulate: true });
        return true;
      }
      if (route === "/demo/simulate") {
        if (req.method !== "POST") json(res, 405, { error: "use POST" });
        else {
          const result = await options.simulator.simulate();
          json(res, result.ok ? 200 : result.status, result);
        }
        return true;
      }
      return false;
    },
  });
}
