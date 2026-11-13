import type { CollectorEvent } from "collector/src/types";
import { useEffect, useMemo, useState } from "react";
import { eventsAtStep, orderedEvents, stepsOf, triggersOf } from "./replay";

const STEP_MS = 900; // long enough for one packet to cross an edge

// Replays a stored trigger step by step. `position` is null while the page is live, otherwise
// how many steps have been shown: 0 is before the first, `total` is the end.
export function useReplay(events: CollectorEvent[]) {
  const triggers = useMemo(() => triggersOf(events), [events]);
  const [chosen, setChosen] = useState<string>();
  const [position, setPosition] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const triggerId = triggers.some((t) => t.id === chosen) ? chosen : triggers.at(-1)?.id;
  const ordered = useMemo(() => (triggerId ? orderedEvents(events, triggerId) : []), [events, triggerId]);
  const steps = useMemo(() => stepsOf(ordered), [ordered]);
  const total = steps.length;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPosition((p) => Math.min((p ?? 0) + 1, total)), STEP_MS);
    return () => clearInterval(timer);
  }, [playing, total]);

  useEffect(() => {
    if (playing && position !== null && position >= total) setPlaying(false);
  }, [playing, position, total]);

  const clamp = (n: number) => Math.max(0, Math.min(n, total));

  return {
    triggers,
    triggerId,
    ordered,
    steps,
    total,
    position,
    playing,
    currentStep: position ? steps[position - 1] : undefined,
    shownEvents: position === null ? undefined : eventsAtStep(ordered, steps, position),
    choose(id: string) {
      setChosen(id);
      setPlaying(false);
      setPosition((p) => (p === null ? null : 0));
    },
    play() {
      const from = position === null || position >= total ? 0 : position;
      setPosition(clamp(from + 1));
      setPlaying(true);
    },
    pause() {
      setPlaying(false);
    },
    step(delta: number) {
      setPlaying(false);
      setPosition((p) => clamp((p ?? 0) + delta));
    },
    seek(n: number) {
      setPlaying(false);
      setPosition(clamp(n));
    },
    exit() {
      setPlaying(false);
      setPosition(null);
    },
  };
}

export type Replay = ReturnType<typeof useReplay>;
