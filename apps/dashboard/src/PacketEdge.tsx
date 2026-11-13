import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

// An edge that sends a packet along itself each time data.pulse goes up.
export function PacketEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const pulse = (props.data as { pulse?: number } | undefined)?.pulse ?? 0;

  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} label={props.label} labelX={labelX} labelY={labelY} />
      {pulse > 0 && (
        <circle key={pulse} r="6" className="packet">
          <animateMotion dur="0.9s" path={path} fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" begin="0.7s" dur="0.2s" fill="freeze" />
        </circle>
      )}
    </>
  );
}
