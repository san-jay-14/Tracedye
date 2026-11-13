// Dev wiring for capture. Placeholder until Day 7: events are printed instead of sent
// to the collector, and arming is a tiny HTTP control port instead of the dashboard.
//   curl -X POST localhost:3002/arm/user%20login      curl -X POST localhost:3002/disarm
import { createServer } from "node:http";
import { arm, disarm, onEvent } from "capture";

const short = (value: unknown) => {
  const json = JSON.stringify(value) ?? "undefined";
  return json.length > 160 ? `${json.slice(0, 160)}…` : json;
};

onEvent((event) => {
  if (event.phase === "collapsed") {
    console.log(`[fn] ${event.triggerId} collapsed ${event.nodeId} calls=${event.calls}`);
    return;
  }
  const detail =
    event.phase === "enter"
      ? ` in=${short(event.input)}`
      : ` ${event.durationMs?.toFixed(1)}ms${event.threw ? " threw" : ` out=${short(event.output)}`}`;
  console.log(
    `[fn] ${event.triggerId} ${event.phase.padEnd(5)} span=${event.spanId} parent=${event.parentId ?? "-"} ${event.nodeId}${detail}`,
  );
});

const CONTROL_PORT = Number(process.env.CAPTURE_CONTROL_PORT ?? 3002);

createServer((req, res) => {
  const [, action, name] = (req.url ?? "").split("/");
  if (req.method !== "POST" || (action !== "arm" && action !== "disarm")) {
    res.writeHead(404).end();
    return;
  }
  if (action === "arm") arm(decodeURIComponent(name ?? ""));
  else disarm();
  console.log(`[capture] ${action === "arm" ? `armed "${decodeURIComponent(name ?? "")}"` : "disarmed"}`);
  res.end("ok");
}).listen(CONTROL_PORT, "127.0.0.1");
