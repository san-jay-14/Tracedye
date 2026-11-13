import { useEffect, useMemo, useState } from "react";
import { FlowCanvas } from "./FlowCanvas";
import { buildGraph } from "./graph";
import { callStackOf, dedupeEvents, hopsOf, latestTriggerId } from "./hops";
import { ReplayBar } from "./ReplayBar";
import { TriggerBar } from "./TriggerBar";
import { buildReplayGraph, stepEdgeIds } from "./replay";
import { useReplay } from "./useReplay";
import { CallStack, HopList, PayloadDiff } from "./Panels";
import { EDGE_LOOK, PROVENANCE_DESCRIPTION } from "./provenance";
import { useCollector } from "./useCollector";
import { usePulses } from "./usePulses";

export function App() {
  const { connected, map, stored, live, armed } = useCollector();
  const events = useMemo(() => dedupeEvents([...stored, ...live]), [stored, live]);
  const replay = useReplay(events);
  const replaying = replay.position !== null;

  // Live, the canvas shows everything stored; replaying, only the chosen trigger up to the current step.
  const liveGraph = useMemo(() => buildGraph(map, events), [map, events]);
  const replayGraph = useMemo(
    () => (replay.shownEvents ? buildReplayGraph(map, replay.ordered, replay.shownEvents) : undefined),
    [map, replay.ordered, replay.shownEvents],
  );
  const graph = replayGraph?.graph ?? liveGraph;

  const livePulses = usePulses(live);
  const replayPulses = useMemo(
    () => Object.fromEntries(stepEdgeIds(replay.currentStep).map((id) => [id, replay.position ?? 0])),
    [replay.currentStep, replay.position],
  );
  const pulses = replaying ? replayPulses : livePulses;

  // The panels follow the latest trigger, or the replayed one up to the current step.
  const triggerId = replaying ? replay.triggerId : latestTriggerId(events);
  const triggerEvents = useMemo(
    () => (replay.shownEvents ?? events).filter((e) => e.triggerId === triggerId),
    [events, replay.shownEvents, triggerId],
  );
  const hops = useMemo(() => hopsOf(triggerEvents), [triggerEvents]);
  const stack = useMemo(() => callStackOf(triggerEvents, triggerId ?? ""), [triggerEvents, triggerId]);

  const [selectedId, setSelectedId] = useState<string>();
  // Stepping clears a manual choice, so the payload follows the hop the replay just reached.
  useEffect(() => setSelectedId(undefined), [replay.position]);
  const selected = hops.find((hop) => hop.id === selectedId) ?? (replaying ? hops.at(-1) : hops[0]);
  const selectedEdgeId = selected && `${selected.from}->${selected.to}`;

  const selectEdge = (edgeId: string) => {
    const hit = [...hops].reverse().find((hop) => `${hop.from}->${hop.to}` === edgeId);
    if (hit) setSelectedId(hit.id);
  };

  return (
    <div className="app">
      <header>
        <h1>Data flow debugger</h1>
        <span className={`status ${connected ? "on" : "off"}`}>
          {connected ? (armed ? `armed: ${armed}` : "connected, not armed") : "collector not reachable"}
        </span>
        <TriggerBar armed={armed} connected={connected} />
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
        <section className="canvas">
          {graph.nodes.length === 0 ? (
            <p className="empty">
              {connected ? "No map yet. Run the indexer and POST its output to the collector." : "Waiting for the collector."}
            </p>
          ) : (
            <FlowCanvas graph={graph} layoutGraph={replayGraph?.layout} pulses={pulses} selectedEdgeId={selectedEdgeId} onEdgeClick={selectEdge} />
          )}
        </section>

        <aside>
          <h2>
            Hops
            {triggerId && <small>{triggerEvents[0]?.triggerName} · {triggerId}</small>}
          </h2>
          <HopList hops={hops} selectedId={selected?.id} onSelect={setSelectedId} />

          <h2>Payload</h2>
          <PayloadDiff hop={selected} />

          <h2>Call stack</h2>
          <CallStack rows={stack.rows} collapsed={stack.collapsed} />
        </aside>
      </main>

      <ReplayBar replay={replay} />

      <footer>Supported stack (v1): TypeScript on Node with Express, React (Vite), Postgres, Redis and one LLM call.</footer>
    </div>
  );
}
