import { useEffect, useMemo, useState } from "react";
import { FlowCanvas } from "./FlowCanvas";
import { buildGraph } from "./graph";
import { callStackOf, dedupeEvents, hopsOf, latestTriggerId } from "./hops";
import { CallStack, HopList, Panel, PayloadDiff } from "./Panels";
import { EDGE_LOOK, PROVENANCE_DESCRIPTION } from "./provenance";
import { buildReplayGraph, stepEdgeIds } from "./replay";
import { ReplayBar } from "./ReplayBar";
import { SimulateButton } from "./SimulateButton";
import { TriggerBar } from "./TriggerBar";
import { useCollector } from "./useCollector";
import { useDemo } from "./useDemo";
import { usePulses } from "./usePulses";
import { useReplay } from "./useReplay";

export function App() {
  const { connected, map, stored, live, armed } = useCollector();
  const events = useMemo(() => dedupeEvents([...stored, ...live]), [stored, live]);
  const demo = useDemo();
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

  const state = !connected ? "offline" : armed ? "armed" : "idle";
  const triggerName = triggerEvents[0]?.triggerName;

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">
          Trace<em>dye</em>
        </h1>
        {demo ? <SimulateButton connected={connected} /> : <TriggerBar armed={armed} connected={connected} />}
        <span className={`status ${state}`} role="status">
          <span className="dot" aria-hidden="true" />
          {state === "offline" ? "Collector offline" : state === "armed" ? `Armed · ${armed}` : "Idle"}
        </span>
      </header>

      <main>
        <section className="canvas" aria-label="Flow map">
          {graph.nodes.length === 0 ? (
            <div className="empty">
              <p className="empty-title">{connected ? "Nothing mapped yet." : "Waiting for the collector."}</p>
              <p>
                {connected
                  ? "Run tracedye dev from your project, or send the indexer's output to the collector."
                  : "Start it with tracedye dev, then this page connects by itself."}
              </p>
            </div>
          ) : (
            <FlowCanvas graph={graph} layoutGraph={replayGraph?.layout} pulses={pulses} selectedEdgeId={selectedEdgeId} onEdgeClick={selectEdge} />
          )}

          <ul className="legend" aria-label="Edge legend">
            {(["observed", "static", "inferred"] as const).map((provenance) => (
              <li key={provenance} title={PROVENANCE_DESCRIPTION[provenance]}>
                <svg width="28" height="8" aria-hidden="true">
                  <line
                    x1="1"
                    y1="4"
                    x2="27"
                    y2="4"
                    stroke={EDGE_LOOK[provenance].stroke}
                    strokeWidth={EDGE_LOOK[provenance].strokeWidth}
                    strokeDasharray={EDGE_LOOK[provenance].strokeDasharray}
                    strokeLinecap="round"
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

          <ReplayBar replay={replay} />
        </section>

        <aside className="inspector">
          <Panel title="Hops" meta={triggerId && triggerName ? `${triggerName} · ${triggerId.slice(-8)}` : undefined}>
            <HopList
              hops={hops}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              empty={demo ? "No hops yet. Press Simulate login." : undefined}
            />
          </Panel>
          <Panel title="Payload">
            <PayloadDiff hop={selected} />
          </Panel>
          <Panel title="Call stack">
            <CallStack rows={stack.rows} collapsed={stack.collapsed} />
          </Panel>
          {demo && (
            <p className="stack-note">
              This is a hosted demo. The login runs against a sample app with real Postgres and Redis. The LLM call is a stub, because no API key is set here.
            </p>
          )}
          <p className="stack-note">Supported stack (v1): TypeScript on Node with Express, React (Vite), Postgres, Redis and one LLM call.</p>
        </aside>
      </main>
    </div>
  );
}
