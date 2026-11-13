import type { Provenance } from "collector/src/types";

export interface EdgeLook {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
  label?: string;
}

// ARCHITECTURE.md: observed is solid, static is dashed and faded, inferred is dotted and labeled.
export const EDGE_LOOK: Record<Provenance, EdgeLook> = {
  observed: { stroke: "var(--observed)", strokeWidth: 2.5, opacity: 1 },
  static: { stroke: "var(--static)", strokeWidth: 1.5, strokeDasharray: "7 6", opacity: 0.5 },
  inferred: { stroke: "var(--inferred)", strokeWidth: 1.5, strokeDasharray: "2 5", opacity: 0.85, label: "inferred" },
};

export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  observed: "Observed: seen at runtime during a trigger",
  static: "Static: found by the compiler, never seen running",
  inferred: "Inferred: suggested, not confirmed",
};
