import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, StepBackIcon, StepForwardIcon } from "./icons";
import type { Replay } from "./useReplay";

// The timeline marks every step, and the ones where data left your code (hops) are taller,
// so the track shows where in the request the crossings happen.
function Timeline({ replay }: { replay: Replay }) {
  const { steps, ordered, total, position } = replay;
  return (
    <div className="timeline">
      <input
        type="range"
        min={0}
        max={total}
        value={position ?? 0}
        onChange={(e) => replay.seek(Number(e.target.value))}
        disabled={total === 0}
        aria-label="Replay position"
      />
      <div className="ticks" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step.index}
            className={`tick${ordered[step.index]?.phase === "hop" ? " hop" : ""}${position !== null && i < position ? " done" : ""}`}
            style={{ ["--at" as string]: (i + 1) / total }}
          />
        ))}
      </div>
    </div>
  );
}

export function ReplayBar({ replay }: { replay: Replay }) {
  const { triggers, triggerId, total, position, playing, currentStep } = replay;
  const replaying = position !== null;

  if (triggers.length === 0) return null;

  return (
    <div className="transport" role="group" aria-label="Replay">
      <select value={triggerId} onChange={(e) => replay.choose(e.target.value)} aria-label="Trigger to replay">
        {triggers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.id.slice(-8)} · {t.events} events
          </option>
        ))}
      </select>

      <div className="controls">
        <button onClick={() => replay.seek(0)} disabled={total === 0} aria-label="Back to start" title="Back to start">
          <SkipBackIcon />
        </button>
        <button onClick={() => replay.step(-1)} disabled={!position} aria-label="Step back" title="Step back">
          <StepBackIcon />
        </button>
        {playing ? (
          <button className="play" onClick={replay.pause} aria-label="Pause" title="Pause">
            <PauseIcon />
          </button>
        ) : (
          <button className="play" onClick={replay.play} disabled={total === 0} aria-label="Play" title="Play from here">
            <PlayIcon />
          </button>
        )}
        <button onClick={() => replay.step(1)} disabled={total === 0 || position === total} aria-label="Step forward" title="Step forward">
          <StepForwardIcon />
        </button>
        <button onClick={() => replay.seek(total)} disabled={total === 0} aria-label="Jump to end" title="Jump to end">
          <SkipForwardIcon />
        </button>
      </div>

      <Timeline replay={replay} />

      <span className="step-label" aria-live="polite">
        {!replaying ? "Live" : position === 0 ? `Start · ${total} steps` : `${position}/${total} · ${currentStep?.label}`}
      </span>

      {replaying && (
        <button className="live" onClick={replay.exit}>
          Back to live
        </button>
      )}
    </div>
  );
}
