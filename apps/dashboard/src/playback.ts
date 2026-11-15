// The speeds the viewer can pick. Instant shows a whole request at once, with no animation.
export const SPEEDS = [0.25, 0.5, 1, 2, 4, Infinity] as const;
export type Speed = number;

// How long one step takes at 1x. Every animation is scaled from this, so changing the speed
// changes how long a packet travels, how long a node glows, and how long the replay waits.
export const BASE_STEP_MS = 900;

export const speedLabel = (speed: Speed) => (speed === Infinity ? "Instant" : `${speed}×`);

export const stepDelay = (speed: Speed) => (speed === Infinity ? 0 : BASE_STEP_MS / speed);

export const clampPosition = (position: number, total: number) => Math.max(0, Math.min(position, total));

// The next faster (+1) or slower (-1) speed on the list, staying put at either end.
export function shiftSpeed(current: Speed, direction: 1 | -1): Speed {
  const index = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  const from = index === -1 ? SPEEDS.indexOf(1) : index;
  return SPEEDS[Math.max(0, Math.min(from + direction, SPEEDS.length - 1))];
}

const KEY = "tracedye.speed";

export function loadSpeed(): Speed {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return SPEEDS.includes(stored as (typeof SPEEDS)[number]) ? stored : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(speed: Speed): void {
  try {
    localStorage.setItem(KEY, String(speed));
  } catch {
    // storage can be blocked; the speed just won't be remembered
  }
}
