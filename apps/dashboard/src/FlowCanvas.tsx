import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Graph } from "./graph";
import { NODE_WIDTH, layoutNodes } from "./layout";
import { EDGE_LOOK } from "./provenance";

export function FlowCanvas({ graph }: { graph: Graph }) {
  const { nodes, edges } = useMemo(() => toFlow(graph), [graph]);

  return (
    // Keyed by node count so the view re-fits when the map arrives or grows (fitView only runs on mount).
    <ReactFlow key={nodes.length} nodes={nodes} edges={edges} colorMode="system" fitView nodesConnectable={false} minZoom={0.2}>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function toFlow(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const positions = layoutNodes(graph.nodes, graph.edges);

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
