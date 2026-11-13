export type Provenance = "observed" | "static" | "inferred";

export interface MapNode {
  id: string;
  kind: "app" | "store" | "ai" | "external";
  label: string;
  file?: string;
  line?: number;
}

export interface MapEdge {
  from: string;
  to: string;
  provenance: Provenance;
}

export interface MapOutput {
  nodes: MapNode[];
  edges: MapEdge[];
}
