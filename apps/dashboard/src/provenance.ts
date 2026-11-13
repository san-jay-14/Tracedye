import type { Provenance } from "collector/src/types";

export interface EdgeLook {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
  label?: string;
}

// ARCHITECTURE.md: observed is solid, static is dashed and faded, inferred is dotted and labeled.
// Green is reserved for what really happened; everything else is a shade of ink.
export const EDGE_LOOK: Record<Provenance, EdgeLook> = {
  observed: { stroke: "var(--observed)", strokeWidth: 2, opacity: 1 },
  static: { stroke: "var(--static)", strokeWidth: 1.25, strokeDasharray: "5 5", opacity: 0.6 },
  inferred: { stroke: "var(--inferred)", strokeWidth: 1.5, strokeDasharray: "1.5 4", opacity: 0.85, label: "inferred" },
};

export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  observed: "Observed: seen at runtime during a trigger",
  static: "Static: found by the compiler, never seen running",
  inferred: "Inferred: suggested, not confirmed",
};
