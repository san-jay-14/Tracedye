import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, type ReactNode } from "react";
import type { Graph } from "./graph";
import { NODE_WIDTH, layoutNodes } from "./layout";
import { PacketEdge } from "./PacketEdge";
import { EDGE_LOOK } from "./provenance";

const edgeTypes = { packet: PacketEdge };

interface Props {
  graph: Graph;
  // Where nodes go. Replay passes the whole trigger here so nothing moves while stepping.
  layoutGraph?: Graph;
  pulses: Record<string, number>;
  arrivals: Record<string, number>; // node id -> number of the packet that just reached it, to ripple it
  travelMs: number; // how long a packet takes to cross an edge; 0 turns the animation off
  selectedEdgeId?: string;
  onEdgeClick: (edgeId: string) => void;
  onOpenGroup: (nodeId: string) => void; // a box that stands for several nodes was clicked
  focusId?: string; // the node being looked at; the rest of the picture is dimmed
  onSelectNode: (nodeId: string) => void;
}

export function FlowCanvas({ graph, layoutGraph, pulses, arrivals, travelMs, selectedEdgeId, onEdgeClick, onOpenGroup, focusId, onSelectNode }: Props) {
  // Positions and labels only change with the graph itself, not with every packet.
  const positions = useMemo(() => {
    const laidOut = layoutGraph ?? graph;
    return layoutNodes(laidOut.nodes, laidOut.edges);
  }, [graph, layoutGraph]);
  const base = useMemo(() => toFlow(graph, positions), [graph, positions]);
  const near = useMemo(() => neighboursOf(graph, focusId), [graph, focusId]);
  const nodes = useMemo(
    () =>
      base.nodes.map((node) => {
        const lit = withRipple(node, arrivals[node.id]);
        if (!near) return lit;
        return { ...lit, className: `${lit.className} ${node.id === focusId ? "node-focus" : near.has(node.id) ? "" : "dim"}` };
      }),
    [base.nodes, arrivals, near, focusId],
  );
  const edges = useMemo(
    () =>
      base.edges.map((edge) => ({
        ...edge,
        className: `${edge.className} ${edge.id === selectedEdgeId ? "edge-selected" : ""} ${near && !(near.has(edge.source) && near.has(edge.target) && (edge.source === focusId || edge.target === focusId)) ? "dim" : ""}`,
        data: { pulse: pulses[edge.id] ?? 0, travelMs },
      })),
    [base.edges, pulses, travelMs, selectedEdgeId, near, focusId],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      edgeTypes={edgeTypes}
      onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
      onNodeClick={(_, node) => ((node.data as { container?: boolean }).container ? onOpenGroup(node.id) : onSelectNode(node.id))}
      onPaneClick={() => focusId && onSelectNode(focusId)}
      nodesDraggable={false}
      colorMode="dark"
      fitView
      fitViewOptions={{ padding: 0.12, maxZoom: 1.15 }}
      nodesConnectable={false}
      minZoom={0.2}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--dot)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable ariaLabel="Overview of the whole map" style={{ width: 150, height: 96 }} nodeColor="#6b6b73" nodeStrokeWidth={0} maskColor="rgba(9, 9, 10, 0.7)" />
      <RefitOnChange signature={(layoutGraph ?? graph).nodes.map((n) => n.id).join("|")} />
    </ReactFlow>
  );
}

// The node and what it directly calls or is called by. Undefined when nothing is being looked at.
function neighboursOf(graph: Graph, focusId: string | undefined): Set<string> | undefined {
  if (!focusId || !graph.nodes.some((n) => n.id === focusId)) return undefined;
  const near = new Set([focusId]);
  for (const edge of graph.edges) {
    if (edge.from === focusId) near.add(edge.to);
    if (edge.to === focusId) near.add(edge.from);
  }
  return near;
}

// Frames the whole picture again, with a glide, whenever the set of boxes changes: the map arrives,
// a request brings new nodes, or a box is opened or closed.
function RefitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView({ padding: 0.12, maxZoom: 1.15, duration: 600 }));
    return () => cancelAnimationFrame(frame);
  }, [signature, fitView]);
  return null;
}

// What a node is, in words: colour is kept for what happened, so the kind is written out.
const KIND_WORD = { app: "route", store: "store", ai: "model", external: "client" } as const;
function nodeCaption(node: Graph["nodes"][number]): string {
  if (node.container) return node.container.caption;
  const place = node.file ? `${node.file.split("/").pop()}:${node.line}` : "";
  return node.kind === "app" ? place || KIND_WORD.app : [KIND_WORD[node.kind], place].filter(Boolean).join(" · ");
}

// A ring that spreads from a node when a packet reaches it. Keyed by the packet number, so each
// arrival is a fresh element and the animation plays again.
function withRipple(node: Node, arrival: number | undefined): Node {
  if (!arrival) return node;
  return { ...node, data: { ...node.data, label: (<>{(node.data as { label: ReactNode }).label}<span key={arrival} className="ripple" aria-hidden="true" /></>) } };
}

function toFlow(graph: Graph, positions: Map<string, { x: number; y: number }>): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    // A node that never ran stays faded and dashed, like its static edges.
    className: `node node-${node.kind} ${node.seen ? "node-seen" : "node-unseen"}${node.container ? " node-group" : ""}`,
    style: { width: NODE_WIDTH },
    sourcePosition: "right" as Node["sourcePosition"],
    targetPosition: "left" as Node["targetPosition"],
    data: {
      label: (
        <div>
          <strong>{node.label}</strong>
          <small>{nodeCaption(node)}</small>
          {node.container && <span className="open-hint" aria-hidden="true">Open</span>}
        </div>
      ),
      container: Boolean(node.container),
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => {
    const { label, ...style } = EDGE_LOOK[edge.provenance];
    return {
      id: edge.id,
      type: "packet",
      source: edge.from,
      target: edge.to,
      className: `edge-${edge.provenance}`,
      style,
      label,
      markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
    };
  });

  return { nodes, edges };
}
