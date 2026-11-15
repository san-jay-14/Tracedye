import type { CollectorEvent } from "collector/src/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampPosition, loadSpeed, saveSpeed, stepDelay, type Speed } from "./playback";
import { eventsAtStep, orderedEvents, stepsOf, triggersOf } from "./replay";

// One engine for everything the viewer shows. A request is a list of steps; the position says how
// many have happened. "Live" is not a separate mode: when a new request arrives and the viewer is
// following, it simply plays that request from the start at the chosen speed.
export function usePlayback(events: CollectorEvent[], liveTriggerIds: Set<string>) {
  const triggers = useMemo(() => triggersOf(events), [events]);
  const latestId = triggers.at(-1)?.id;

  const [chosen, setChosen] = useState<string | undefined>(); // undefined means follow the newest request
  const triggerId = chosen && triggers.some((t) => t.id === chosen) ? chosen : latestId;
  const following = chosen === undefined;

  const ordered = useMemo(() => (triggerId ? orderedEvents(events, triggerId) : []), [events, triggerId]);
  const steps = useMemo(() => stepsOf(ordered), [ordered]);
  const total = steps.length;

  const [position, setPosition] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(loadSpeed);
  const [loop, setLoop] = useState(false);
  const caughtUp = useRef(false); // the viewer had reached the end of what was known

  // A packet is sent when the position moves because of playing, stepping or seeking, not when a
  // request is simply put on screen. `sent` says which position was moved to and gives each move a number.
  const moved = useRef(false);
  const [sent, setSent] = useState<{ position: number; n: number } | null>(null);
  useEffect(() => {
    const fromPlayback = moved.current; // read now: the updater below runs later
    moved.current = false;
    setSent((s) => (fromPlayback ? { position, n: (s?.n ?? 0) + 1 } : null));
  }, [position]);

  // A different request is on screen: a new live one plays from the start, an old one shows complete.
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (triggerId === previous.current) return;
    previous.current = triggerId;
    caughtUp.current = false;
    moved.current = false;
    if (triggerId && liveTriggerIds.has(triggerId) && following && speed !== Infinity) {
      setPosition(0);
      setPlaying(true);
    } else {
      setPosition(total);
      setPlaying(false);
    }
  }, [triggerId, liveTriggerIds, following, speed, total]);

  // More steps of the request on screen arrived while it was playing: carry on.
  useEffect(() => {
    if (speed === Infinity) setPosition(total);
    else if (caughtUp.current && following && total > position) {
      caughtUp.current = false;
      setPlaying(true);
    }
  }, [total, speed, following, position]);

  // The clock.
  useEffect(() => {
    if (!playing) return;
    if (position >= total) {
      if (loop && total > 0) {
        const wait = setTimeout(() => ((moved.current = true), setPosition(0)), 700);
        return () => clearTimeout(wait);
      }
      caughtUp.current = true;
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => ((moved.current = true), setPosition((p) => clampPosition(p + 1, total))), stepDelay(speed));
    return () => clearTimeout(timer);
  }, [playing, position, total, speed, loop]);

  const setSpeed = useCallback((next: Speed) => {
    setSpeedState(next);
    saveSpeed(next);
  }, []);

  return {
    triggers,
    triggerId,
    following,
    ordered,
    steps,
    total,
    position,
    sent,
    playing,
    speed,
    loop,
    stepMs: stepDelay(speed),
    currentStep: position ? steps[position - 1] : undefined,
    shownEvents: eventsAtStep(ordered, steps, position),
    setSpeed,
    toggleLoop: () => setLoop((on) => !on),
    play() {
      caughtUp.current = false;
      if (position >= total) setPosition(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    step(delta: number) {
      setPlaying(false);
      moved.current = true;
      setPosition((p) => clampPosition(p + delta, total));
    },
    seek(n: number) {
      setPlaying(false);
      moved.current = true;
      setPosition(clampPosition(n, total));
    },
    // Pick a request to look at, or undefined to follow the newest one again.
    choose(id: string | undefined) {
      setChosen(id);
      setPlaying(false);
    },
  };
}

export type Playback = ReturnType<typeof usePlayback>;
