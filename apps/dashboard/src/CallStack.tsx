import { activeFrames, labelOf, type CallRow, type CollapsedRow } from "./hops";

// The stack as a debugger shows it: the calls running right now, newest on top, each one sitting
// on the call that made it. Calls that already returned are listed under it.
export function CallStack({ rows, collapsed }: { rows: CallRow[]; collapsed: CollapsedRow[] }) {
  if (rows.length === 0) return <p className="empty-note">No function calls captured yet.</p>;
  const frames = activeFrames(rows);
  const finished = rows.filter((row) => row.durationMs !== undefined);
  const longest = Math.max(...finished.map((r) => r.durationMs ?? 0), 1);

  return (
    <div className="callstack">
      <h3 className="subhead">Running now</h3>
      {frames.length === 0 ? (
        <p className="empty-note">The stack is empty. Every call has returned.</p>
      ) : (
        <ol className="frames" aria-label="Call stack, newest call first">
          {frames.map((frame, i) => (
            <li key={frame.spanId} className={i === 0 ? "frame top" : "frame"}>
              <span className="frame-name">{labelOf(frame.nodeId)}</span>
              {i === 0 && <span className="tag">running</span>}
              {i === frames.length - 1 && frames.length > 1 && <span className="tag">entry</span>}
            </li>
          ))}
        </ol>
      )}

      <h3 className="subhead">Returned</h3>
      {finished.length === 0 && collapsed.length === 0 ? (
        <p className="empty-note">Nothing has returned yet.</p>
      ) : (
        <ul className="stack">
          {finished.map((row) => {
            const ms = row.durationMs as number;
            return (
              <li key={row.spanId} style={{ ["--depth" as string]: row.depth }} className={row.threw ? "threw" : undefined}>
                <span className="stack-name">{labelOf(row.nodeId)}</span>
                {row.threw && <span className="tag error">threw</span>}
                <span className="mono muted stack-time">{`${ms.toFixed(1)} ms`}</span>
                <span className="stack-bar" style={{ width: `${Math.max(1.5, (ms / longest) * 100)}%` }} />
              </li>
            );
          })}
          {collapsed.map((c) => (
            <li key={c.nodeId} className="stack-collapsed">
              <span className="stack-name">{labelOf(c.nodeId)}</span>
              <span className="mono muted">×{c.calls}, collapsed after 10</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
