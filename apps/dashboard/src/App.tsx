import { useMemo } from "react";
import { FlowCanvas } from "./FlowCanvas";
import { buildGraph } from "./graph";
import { EDGE_LOOK, PROVENANCE_DESCRIPTION } from "./provenance";
import { useCollector } from "./useCollector";

export function App() {
  const { connected, map, events, armed } = useCollector();
  const graph = useMemo(() => buildGraph(map, events), [map, events]);

  return (
    <div className="app">
      <header>
        <h1>Data flow debugger</h1>
        <span className={`status ${connected ? "on" : "off"}`}>
          {connected ? (armed ? `armed: ${armed}` : "connected, not armed") : "collector not reachable"}
        </span>
        <ul className="legend" aria-label="Edge legend">
          {(["observed", "static", "inferred"] as const).map((provenance) => (
            <li key={provenance} title={PROVENANCE_DESCRIPTION[provenance]}>
              <svg width="38" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="38"
                  y2="4"
                  stroke={EDGE_LOOK[provenance].stroke}
                  strokeWidth={EDGE_LOOK[provenance].strokeWidth}
                  strokeDasharray={EDGE_LOOK[provenance].strokeDasharray}
                  opacity={EDGE_LOOK[provenance].opacity}
                />
              </svg>
              {provenance}
            </li>
          ))}
          <li title="A function in the code that has not run during any captured trigger">
            <span className="swatch-unseen" aria-hidden="true" />
            never ran
          </li>
        </ul>
      </header>

      <main>
        {graph.nodes.length === 0 ? (
          <p className="empty">
            {connected ? "No map yet. Run the indexer and POST its output to the collector." : "Waiting for the collector."}
          </p>
        ) : (
          <FlowCanvas graph={graph} />
        )}
      </main>

      <footer>Supported stack (v1): TypeScript on Node with Express, React (Vite), Postgres, Redis and one LLM call.</footer>
    </div>
  );
}
