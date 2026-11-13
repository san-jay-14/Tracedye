import type { Replay } from "./useReplay";

export function ReplayBar({ replay }: { replay: Replay }) {
  const { triggers, triggerId, total, position, playing, currentStep } = replay;
  const replaying = position !== null;

  if (triggers.length === 0) {
    return <div className="replay muted">Replay: no stored triggers yet. Arm a trigger and use the app.</div>;
  }

  return (
    <div className="replay" role="group" aria-label="Replay">
      <label>
        Trigger
        <select value={triggerId} onChange={(e) => replay.choose(e.target.value)}>
          {triggers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.id} · {t.events} events
            </option>
          ))}
        </select>
      </label>

      <div className="controls">
        <button onClick={() => replay.seek(0)} disabled={total === 0} aria-label="Back to start" title="Back to start">
          ⏮
        </button>
        <button onClick={() => replay.step(-1)} disabled={!position} aria-label="Step back" title="Step back">
          ◀
        </button>
        {playing ? (
          <button onClick={replay.pause} aria-label="Pause" title="Pause">
            ⏸
          </button>
        ) : (
          <button onClick={replay.play} disabled={total === 0} aria-label="Play" title="Play from here">
            ▶
          </button>
        )}
        <button onClick={() => replay.step(1)} disabled={total === 0 || position === total} aria-label="Step forward" title="Step forward">
          ▶|
        </button>
        <button onClick={() => replay.seek(total)} disabled={total === 0} aria-label="Jump to end" title="Jump to end">
          ⏭
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={total}
        value={position ?? 0}
        onChange={(e) => replay.seek(Number(e.target.value))}
        disabled={total === 0}
        aria-label="Replay position"
      />

      <span className="step-label" aria-live="polite">
        {!replaying ? "Live" : position === 0 ? `Start (${total} steps)` : `Step ${position}/${total}: ${currentStep?.label}`}
      </span>

      {replaying && <button onClick={replay.exit}>Back to live</button>}
    </div>
  );
}
