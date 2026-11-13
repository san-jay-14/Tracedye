import type { CollectorEvent } from "collector/src/types";
import { useEffect, useRef, useState } from "react";
import { dedupeEvents, edgeId, traversalsOf } from "./hops";

const STAGGER_MS = 320; // gap between packets, so a burst of events reads as a journey

// For each edge, how many packets have been sent along it. The canvas starts one animation
// whenever an edge's count goes up. Only live events are passed in, so a page that loads
// stored triggers stays still until something new happens.
export function usePulses(live: CollectorEvent[]): Record<string, number> {
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const handled = useRef(0);
  const nextSlot = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const all = traversalsOf(dedupeEvents(live));
    const fresh = all.slice(handled.current);
    handled.current = all.length;

    const now = performance.now();
    for (const traversal of fresh) {
      const at = Math.max(now, nextSlot.current);
      nextSlot.current = at + STAGGER_MS;
      const edge = edgeId(traversal.from, traversal.to);
      timers.current.push(setTimeout(() => setPulses((p) => ({ ...p, [edge]: (p[edge] ?? 0) + 1 })), at - now));
    }
  }, [live]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return pulses;
}
