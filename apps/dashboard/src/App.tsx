import { useEffect, useMemo, useState } from "react";
import { FlowCanvas } from "./FlowCanvas";
import { buildGraph } from "./graph";
import { callStackOf, dedupeEvents, hopsOf } from "./hops";
import { CallStack, HopList, Panel, PayloadDiff } from "./Panels";
import { EDGE_LOOK, PROVENANCE_DESCRIPTION } from "./provenance";
import { buildReplayGraph, stepEdgeIds } from "./replay";
import { SimulateButton } from "./SimulateButton";
import { Transport } from "./Transport";
import { TriggerBar } from "./TriggerBar";
import { useCollector } from "./useCollector";
import { useDemo } from "./useDemo";
import { usePlayback } from "./usePlayback";

const TRAVEL_SHARE = 0.85; // a packet takes this much of a step, leaving a beat before the next one

export function App() {
  const { connected, map, stored, live, armed } = useCollector();
  const events = useMemo(() => dedupeEvents([...stored, ...live]), [stored, live]);
  const demo = useDemo();
  const liveTriggerIds = useMemo(() => new Set(live.map((e) => e.triggerId)), [live]);
  const playback = usePlayback(events, liveTriggerIds);
  const { triggerId, position, total, stepMs, shownEvents } = playback;

  // The canvas shows the request on screen up to the current step; with none yet, just the map.
  const replayGraph = useMemo(
    () => (triggerId ? buildReplayGraph(map, playback.ordered, shownEvents) : undefined),
    [map, triggerId, playback.ordered, shownEvents],
  );
  const graph = replayGraph?.graph ?? buildGraph(map, []);

  // Each step sends one packet along its edges; the position changing is what starts it.
  const { sent, currentStep } = playback;
  const pulses = useMemo(
    () => (sent && sent.position === position ? Object.fromEntries(stepEdgeIds(currentStep).map((id) => [id, sent.n])) : {}),
    [sent, currentStep, position],
  );

  const hops = useMemo(() => hopsOf(shownEvents), [shownEvents]);
  const stack = useMemo(() => callStackOf(shownEvents, triggerId ?? ""), [shownEvents, triggerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") (e.preventDefault(), playback.playing ? playback.pause() : playback.play());
      else if (e.key === "ArrowRight") playback.step(1);
      else if (e.key === "ArrowLeft") playback.step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [selectedId, setSelectedId] = useState<string>();
  // Stepping clears a manual choice, so the payload follows the hop the replay just reached.
  useEffect(() => setSelectedId(undefined), [position]);
  const selected = hops.find((hop) => hop.id === selectedId) ?? (position < total ? hops.at(-1) : hops[0]);
  const selectedEdgeId = selected && `${selected.from}->${selected.to}`;

  const selectEdge = (edgeId: string) => {
    const hit = [...hops].reverse().find((hop) => `${hop.from}->${hop.to}` === edgeId);
    if (hit) setSelectedId(hit.id);
  };

  const state = !connected ? "offline" : armed ? "armed" : "idle";
  const triggerName = playback.triggers.find((t) => t.id === triggerId)?.name;

  return (
    <div className="app" style={{ ["--tempo" as string]: `${stepMs}ms` }}>
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
            <FlowCanvas graph={graph} layoutGraph={replayGraph?.layout} pulses={pulses} travelMs={stepMs * TRAVEL_SHARE} selectedEdgeId={selectedEdgeId} onEdgeClick={selectEdge} />
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

          <Transport playback={playback} />
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
