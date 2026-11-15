import type { GraphNode } from "./graph";
import { labelOf, type CallRow } from "./hops";
import { PayloadDiff } from "./Panels";

// What one function did in the request on screen: each call, what went in and what came out.
export function NodeDetails({ node, calls }: { node?: GraphNode; calls: CallRow[] }) {
  if (!node) return <p className="empty-note">Click a function on the map to see its calls here.</p>;
  const place = node.file ? `${node.file}:${node.line}` : undefined;
  return (
    <div className="node-details">
      <h3 className="node-title">{node.label}</h3>
      {place && <p className="mono muted">{place}</p>}
      {!node.seen && <p className="notice">This function did not run in the request on screen. Its place on the map comes from reading the code.</p>}
      {calls.length === 0 && node.seen && <p className="empty-note">No calls of {labelOf(node.id)} captured yet.</p>}
      {calls.map((call, i) => (
        <section key={call.spanId} className="call">
          <h4 className="subhead">
            Call {i + 1}
            {call.durationMs !== undefined && <span className="mono muted"> · {call.durationMs.toFixed(1)} ms</span>}
            {call.threw && <span className="tag error">threw</span>}
          </h4>
          <PayloadDiff hop={{ before: call.input, after: call.output }} />
        </section>
      ))}
    </div>
  );
}
