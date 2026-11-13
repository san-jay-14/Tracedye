import { diffPayload, type DiffRow } from "./diff";
import { labelOf, type CallRow, type CollapsedRow, type Hop } from "./hops";

const KIND_LABEL: Record<Hop["kind"], string> = { http: "HTTP", db: "Postgres", cache: "Redis", llm: "LLM", ws: "WebSocket" };

const show = (value: unknown) => (value === undefined ? "" : JSON.stringify(value));

export function HopList({ hops, selectedId, onSelect }: { hops: Hop[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (hops.length === 0) return <p className="muted">No hops captured yet. Arm a trigger and use the app.</p>;
  return (
    <ol className="hops">
      {hops.map((hop, i) => (
        <li key={hop.id}>
          <button className={hop.id === selectedId ? "hop selected" : "hop"} onClick={() => onSelect(hop.id)}>
            <span className="hop-n">{i + 1}</span>
            <span className={`chip chip-${hop.kind}`}>{KIND_LABEL[hop.kind]}</span>
            <span className="hop-route">
              {labelOf(hop.from)} → {labelOf(hop.to)}
            </span>
            {hop.durationMs !== undefined && <span className="muted">{hop.durationMs.toFixed(0)} ms</span>}
            {hop.note && <span className="chip chip-note" title={hop.note}>stub</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function PayloadDiff({ hop }: { hop?: Hop }) {
  if (!hop) return <p className="muted">Select a hop to see its payload.</p>;
  if (hop.before === undefined && hop.after === undefined) {
    return <p className="muted">No payload was captured for this hop.</p>;
  }
  // A function that returns nothing has no "after"; the input is shown as it was, not as removed.
  const oneSided = hop.before === undefined || hop.after === undefined;
  const rows = diffPayload(hop.before, hop.after).map((row): DiffRow => (oneSided ? { ...row, status: "same" } : row));
  return (
    <div>
      {hop.note && <p className="note">{hop.note}</p>}
      {oneSided && <p className="muted small">{hop.after === undefined ? "The call returned no value." : "No input was captured."}</p>}
      <p className="muted small">What went into the call, and what came out. Secrets are redacted before they leave the app.</p>
      <table className="diff">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DiffLine key={row.path} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  return (
    <tr className={`diff-${row.status}`}>
      <td>
        {row.path}
        <span className="diff-tag">{row.status === "same" ? "" : row.status}</span>
      </td>
      <td>{show(row.before)}</td>
      <td>{show(row.after)}</td>
    </tr>
  );
}

export function CallStack({ rows, collapsed }: { rows: CallRow[]; collapsed: CollapsedRow[] }) {
  if (rows.length === 0) return <p className="muted">No function calls captured yet.</p>;
  const longest = Math.max(...rows.map((r) => r.durationMs ?? 0), 1);
  return (
    <ul className="stack">
      {rows.map((row) => (
        <li key={row.spanId} style={{ paddingLeft: row.depth * 16 }}>
          <span className="stack-name">{labelOf(row.nodeId)}</span>
          {row.threw && <span className="chip chip-error">threw</span>}
          <span className="muted">{row.durationMs === undefined ? "…" : `${row.durationMs.toFixed(1)} ms`}</span>
          <span className="stack-bar" style={{ width: `${Math.max(2, ((row.durationMs ?? 0) / longest) * 100)}%` }} />
        </li>
      ))}
      {collapsed.map((c) => (
        <li key={c.nodeId} className="muted">
          {labelOf(c.nodeId)} ×{c.calls} (collapsed after the first 10)
        </li>
      ))}
    </ul>
  );
}
