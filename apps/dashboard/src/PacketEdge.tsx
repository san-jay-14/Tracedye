import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";

const TRAIL = 6;
const TRAIL_GAP = 0.035; // how far behind the head each trail dot sits, as a share of the edge

interface PacketData {
  pulse?: number; // goes up each time a packet should be sent
  travelMs?: number; // how long the packet takes; 0 means no animation
}

// An edge that sends a packet, with a short trail, along itself each time data.pulse changes.
// The packet is moved from a frame loop, so its speed follows the playback speed exactly.
export function PacketEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const { pulse = 0, travelMs = 0 } = (props.data ?? {}) as PacketData;

  const route = useRef<SVGPathElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const travel = useRef(travelMs); // read when a packet starts, so changing the speed does not restart one
  travel.current = travelMs;

  useEffect(() => {
    const line = route.current;
    if (!line || pulse === 0 || travel.current <= 0) return;

    const length = line.getTotalLength();
    const start = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const t = Math.min((now - start) / travel.current, 1);
      dots.current.forEach((dot, i) => {
        if (!dot) return;
        const at = t - i * TRAIL_GAP;
        if (at < 0 || t >= 1) return dot.setAttribute("opacity", "0");
        const point = line.getPointAtLength(at * length);
        dot.setAttribute("cx", String(point.x));
        dot.setAttribute("cy", String(point.y));
        dot.setAttribute("opacity", String((1 - i / TRAIL) * (t > 0.85 ? (1 - t) / 0.15 : 1)));
      });
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      dots.current.forEach((dot) => dot?.setAttribute("opacity", "0"));
    };
  }, [pulse]);

  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} label={props.label} labelX={labelX} labelY={labelY} />
      <path ref={route} d={path} fill="none" stroke="none" />
      {Array.from({ length: TRAIL }, (_, i) => (
        <circle
          key={i}
          ref={(el) => {
            dots.current[i] = el;
          }}
          r={6 - i * 0.7}
          opacity="0"
          className="packet"
        />
      ))}
    </>
  );
}
