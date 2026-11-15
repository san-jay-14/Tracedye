import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, StepBackIcon, StepForwardIcon } from "./icons";
import { SPEEDS, speedLabel } from "./playback";
import type { Playback } from "./usePlayback";

// The timeline marks every step, and the ones where data left your code (hops) are taller,
// so the track shows where in the request the crossings happen.
function Timeline({ playback }: { playback: Playback }) {
  const { steps, ordered, total, position } = playback;
  return (
    <div className="timeline">
      <input
        type="range"
        min={0}
        max={total}
        value={position}
        onChange={(e) => playback.seek(Number(e.target.value))}
        disabled={total === 0}
        aria-label="Position in the request"
      />
      <div className="ticks" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={step.index}
            className={`tick${ordered[step.index]?.phase === "hop" ? " hop" : ""}${i < position ? " done" : ""}`}
            style={{ ["--at" as string]: (i + 1) / total }}
          />
        ))}
      </div>
    </div>
  );
}

export function Transport({ playback }: { playback: Playback }) {
  const { triggers, triggerId, total, position, playing, currentStep, speed, loop, following } = playback;
  if (triggers.length === 0) return null;

  return (
    <div className="transport" role="group" aria-label="Playback">
      <select value={triggerId} onChange={(e) => playback.choose(e.target.value)} aria-label="Request to show">
        {triggers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.id.slice(-8)} · {t.events} events
          </option>
        ))}
      </select>

      <div className="controls">
        <button onClick={() => playback.seek(0)} disabled={total === 0} aria-label="Back to start" title="Back to start">
          <SkipBackIcon />
        </button>
        <button onClick={() => playback.step(-1)} disabled={!position} aria-label="Step back" title="Step back (←)">
          <StepBackIcon />
        </button>
        {playing ? (
          <button className="play" onClick={playback.pause} aria-label="Pause" title="Pause (space)">
            <PauseIcon />
          </button>
        ) : (
          <button className="play" onClick={playback.play} disabled={total === 0} aria-label="Play" title="Play (space)">
            <PlayIcon />
          </button>
        )}
        <button onClick={() => playback.step(1)} disabled={total === 0 || position === total} aria-label="Step forward" title="Step forward (→)">
          <StepForwardIcon />
        </button>
        <button onClick={() => playback.seek(total)} disabled={total === 0} aria-label="Jump to end" title="Jump to end">
          <SkipForwardIcon />
        </button>
      </div>

      <Timeline playback={playback} />

      <div className="speeds" role="radiogroup" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button key={s} role="radio" aria-checked={s === speed} className={s === speed ? "on" : undefined} onClick={() => playback.setSpeed(s)}>
            {speedLabel(s)}
          </button>
        ))}
      </div>

      <button className={loop ? "toggle on" : "toggle"} aria-pressed={loop} onClick={playback.toggleLoop} title="Play the request again when it ends">
        Loop
      </button>

      <span className="step-label" aria-live="polite">
        {position === 0 ? `Start · ${total} steps` : `${position}/${total} · ${currentStep?.label}`}
      </span>

      {!following && (
        <button className="live" onClick={() => playback.choose(undefined)}>
          Follow latest
        </button>
      )}
    </div>
  );
}
