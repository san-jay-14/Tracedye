import { useEffect, useMemo, useState } from "react";
import { FlowCanvas } from "./FlowCanvas";
import { BACKEND, abstractGraph, buildHierarchy, visibleId } from "./abstraction";
import { filterGraph, type Hideable } from "./filters";
import { buildGraph } from "./graph";
import { callStackOf, dedupeEvents, edgeId, hopsOf } from "./hops";
import { CallStack } from "./CallStack";
import { Inspector, type Tab } from "./Inspector";
import { LevelBar } from "./LevelBar";
import { NodeDetails } from "./NodeDetails";
import { SearchBox } from "./SearchBox";
import { Shortcuts } from "./Shortcuts";
import { HopList, PayloadDiff } from "./Panels";
import { EDGE_LOOK, PROVENANCE_DESCRIPTION } from "./provenance";
import { buildReplayGraph, stepEdgeIds } from "./replay";
import { SimulateButton } from "./SimulateButton";
import { Transport } from "./Transport";
import { TriggerBar } from "./TriggerBar";
import { useCollector } from "./useCollector";
import { useDemo } from "./useDemo";
import { usePlayback } from "./usePlayback";

const OPEN_KEY = "tracedye.inspector";
const loadOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) !== "closed"; // open unless the viewer closed it
  } catch {
    return true;
  }
};
const saveOpen = (open: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, open ? "open" : "closed");
  } catch {
    // not remembered, that is all
  }
};

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
  const fullGraph = replayGraph?.graph ?? buildGraph(map, []);

  // Level of detail. Groups come from every request seen so far, so they do not shift between requests.
  const everything = useMemo(() => buildGraph(map, events), [map, events]);
  const hierarchy = useMemo(() => buildHierarchy(everything.nodes, everything.edges), [everything]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [hidden, setHidden] = useState<ReadonlySet<Hideable>>(() => new Set());
  const graph = useMemo(() => filterGraph(abstractGraph(fullGraph, hierarchy, expanded), hidden), [fullGraph, hierarchy, expanded, hidden]);
  const layoutGraph = useMemo(
    () => (replayGraph ? filterGraph(abstractGraph(replayGraph.layout, hierarchy, expanded), hidden) : undefined),
    [replayGraph, hierarchy, expanded, hidden],
  );
  const toggleHidden = (what: Hideable) =>
    setHidden((now) => {
      const next = new Set(now);
      if (!next.delete(what)) next.add(what);
      return next;
    });
  const seeAs = (id: string) => visibleId(hierarchy, expanded, id);

  // Each step sends one packet along its edges; the position changing is what starts it. Calls inside
  // a closed box send nothing between boxes, but the box still ripples.
  const { sent, currentStep } = playback;
  const pulses = useMemo(() => {
    if (!sent || sent.position !== position || !currentStep) return {};
    const own = currentStep.traversals.map((t) => edgeId(seeAs(t.from), seeAs(t.to))).filter((id) => graph.edges.some((e) => e.id === id));
    return Object.fromEntries(own.map((id) => [id, sent.n]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, currentStep, position, graph, hierarchy, expanded]);

  // The node each packet is heading for ripples when the packet gets there.
  const arrivals = useMemo(
    () => (sent && sent.position === position && currentStep ? Object.fromEntries(currentStep.traversals.map((t) => [seeAs(t.to), sent.n])) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sent, currentStep, position, hierarchy, expanded],
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
      else if (e.key === "[") setInspectorOpen((o) => !o);
      else if (e.key === "Escape") (setFocusId(undefined), setShowKeys(false));
      else if (e.key === "?") setShowKeys((on) => !on);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [tab, setTab] = useState<Tab>("hops");
  const [inspectorOpen, setInspectorOpen] = useState(loadOpen);
  useEffect(() => saveOpen(inspectorOpen), [inspectorOpen]);
  const [showKeys, setShowKeys] = useState(false);
  const [focusId, setFocusId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  // Stepping clears a manual choice, so the payload follows the hop the replay just reached.
  useEffect(() => setSelectedId(undefined), [position]);
  const selected = hops.find((hop) => hop.id === selectedId) ?? (position < total ? hops.at(-1) : hops[0]);
  const selectedEdgeId = selected && edgeId(seeAs(selected.from), seeAs(selected.to));

  // Picking a hop, in the list or on the canvas, opens its payload.
  const chooseHop = (id: string) => {
    setSelectedId(id);
    setTab("payload");
    setInspectorOpen(true);
  };
  const selectEdge = (clicked: string) => {
    const hit = [...hops].reverse().find((hop) => edgeId(seeAs(hop.from), seeAs(hop.to)) === clicked);
    if (hit) chooseHop(hit.id);
  };

  // Clicking a function looks at it: the rest dims and its calls show in the Function tab. Again to let go.
  const selectNode = (id: string) => {
    setFocusId((now) => (now === id ? undefined : id));
    setTab("node");
    setInspectorOpen(true);
  };
  // Finding a function opens whatever boxes it is inside first.
  const reveal = (id: string) => {
    const group = hierarchy.groupOf.get(id);
    setExpanded((now) => new Set(now).add(BACKEND).add(group ?? BACKEND));
    setFocusId(id);
    setTab("node");
    setInspectorOpen(true);
  };
  const focusNode = fullGraph.nodes.find((n) => n.id === focusId);
  const focusCalls = useMemo(() => stack.rows.filter((row) => row.nodeId === focusId), [stack.rows, focusId]);

  const open = (id: string) => setExpanded((now) => new Set(now).add(id));
  const close = (id: string) => setExpanded((now) => (id === BACKEND ? new Set() : new Set([...now].filter((g) => g !== id))));

  const state = !connected ? "offline" : armed ? "armed" : "idle";
  const triggerName = playback.triggers.find((t) => t.id === triggerId)?.name;

  return (
    <div className="app" style={{ ["--tempo" as string]: `${stepMs}ms` }}>
      <header className="topbar">
        <h1 className="wordmark">
          Trace<em>dye</em>
        </h1>
        {demo ? <SimulateButton connected={connected} /> : <TriggerBar armed={armed} connected={connected} />}
        <SearchBox nodes={fullGraph.nodes} onPick={reveal} />
        <button className="help" onClick={() => setShowKeys(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          ?
        </button>
        <span className={`status ${state}`} role="status">
          <span className="dot" aria-hidden="true" />
          {state === "offline" ? "Collector offline" : state === "armed" ? `Armed · ${armed}` : "Idle"}
        </span>
      </header>

      <main className={inspectorOpen ? undefined : "wide"}>
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
            <FlowCanvas graph={graph} layoutGraph={layoutGraph} pulses={pulses} arrivals={arrivals} travelMs={stepMs * TRAVEL_SHARE} selectedEdgeId={selectedEdgeId} onEdgeClick={selectEdge} onOpenGroup={open} focusId={focusId} onSelectNode={selectNode} />
          )}

          <ul className="legend" aria-label="Edge legend">
            {(["observed", "static", "inferred"] as const).map((provenance) => (
              <li key={provenance}>
                <button className={hidden.has(provenance) ? "off" : undefined} aria-pressed={!hidden.has(provenance)} onClick={() => toggleHidden(provenance)} title={`${PROVENANCE_DESCRIPTION[provenance]} Click to ${hidden.has(provenance) ? "show" : "hide"}.`}>
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
                </button>
              </li>
            ))}
            <li>
              <button className={hidden.has("unseen") ? "off" : undefined} aria-pressed={!hidden.has("unseen")} onClick={() => toggleHidden("unseen")} title="Code that has not run in the request on screen. Click to hide it.">
                <span className="swatch-unseen" aria-hidden="true" />
                never ran
              </button>
            </li>
          </ul>

          {graph.nodes.length > 0 && <LevelBar hierarchy={hierarchy} expanded={expanded} onChange={setExpanded} onClose={close} />}
          <Transport playback={playback} />
        </section>

        <Inspector
          open={inspectorOpen}
          onToggle={() => setInspectorOpen((o) => !o)}
          tab={tab}
          onTab={setTab}
          counts={{ hops: hops.length, stack: stack.rows.length }}
          title={triggerId && triggerName ? `${triggerName} · ${triggerId.slice(-8)}` : undefined}
          footer={
            <>
              {demo && (
                <p className="stack-note">
                  This is a hosted demo. The login runs against a sample app with real Postgres and Redis. The LLM call is a stub, because no API key is set here.
                </p>
              )}
              <p className="stack-note">Supported stack (v1): TypeScript on Node with Express, React (Vite), Postgres, Redis and one LLM call.</p>
            </>
          }
        >
          {tab === "hops" && (
            <HopList hops={hops} selectedId={selected?.id} onSelect={chooseHop} empty={demo ? "No hops yet. Press Simulate login." : undefined} />
          )}
          {tab === "payload" && <PayloadDiff hop={selected} />}
          {tab === "node" && <NodeDetails node={focusNode} calls={focusCalls} />}
          {tab === "stack" && <CallStack rows={stack.rows} collapsed={stack.collapsed} />}
        </Inspector>
      </main>
      {showKeys && <Shortcuts onClose={() => setShowKeys(false)} />}
    </div>
  );
}
