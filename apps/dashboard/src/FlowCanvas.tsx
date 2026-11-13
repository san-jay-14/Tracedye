import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
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
  selectedEdgeId?: string;
  onEdgeClick: (edgeId: string) => void;
}

export function FlowCanvas({ graph, layoutGraph, pulses, selectedEdgeId, onEdgeClick }: Props) {
  // Positions and labels only change with the graph itself, not with every packet.
  const base = useMemo(() => toFlow(graph, layoutGraph ?? graph), [graph, layoutGraph]);
  const edges = useMemo(
    () =>
      base.edges.map((edge) => ({
        ...edge,
        className: `${edge.className} ${edge.id === selectedEdgeId ? "edge-selected" : ""}`,
        data: { pulse: pulses[edge.id] ?? 0 },
      })),
    [base.edges, pulses, selectedEdgeId],
  );

  return (
    // Keyed by node count so the view re-fits when the map arrives or grows (fitView only runs on mount).
    <ReactFlow
      key={(layoutGraph ?? graph).nodes.length}
      nodes={base.nodes}
      edges={edges}
      edgeTypes={edgeTypes}
      onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
      colorMode="system"
      fitView
      nodesConnectable={false}
      minZoom={0.2}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function toFlow(graph: Graph, layoutGraph: Graph): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutNodes(layoutGraph.nodes, layoutGraph.edges);

  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    // A node that never ran stays faded and dashed, like its static edges.
    className: `node node-${node.kind} ${node.seen ? "node-seen" : "node-unseen"}`,
    style: { width: NODE_WIDTH },
    sourcePosition: "right" as Node["sourcePosition"],
    targetPosition: "left" as Node["targetPosition"],
    data: {
      label: (
        <div>
          <strong>{node.label}</strong>
          <small>{node.file ? `${node.file.split("/").pop()}:${node.line}` : node.kind}</small>
        </div>
      ),
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
