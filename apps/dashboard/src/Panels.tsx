import type { ReactNode } from "react";
import { diffPayload, type DiffRow } from "./diff";
import { labelOf, type Hop } from "./hops";

const KIND_LABEL: Record<Hop["kind"], string> = { http: "HTTP", db: "Postgres", cache: "Redis", llm: "LLM", ws: "WebSocket" };

const show = (value: unknown) => (value === undefined ? "" : JSON.stringify(value));

export function Panel({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {meta && <span className="meta">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

export function HopList({ hops, selectedId, onSelect, empty }: { hops: Hop[]; selectedId?: string; onSelect: (id: string) => void; empty?: string }) {
  if (hops.length === 0) {
    return <p className="empty-note">{empty ?? "No hops yet. Arm a trigger, then use your app."}</p>;
  }
  return (
    <ol className="hops">
      {hops.map((hop, i) => (
        <li key={hop.id}>
          <button className={hop.id === selectedId ? "hop selected" : "hop"} onClick={() => onSelect(hop.id)} aria-pressed={hop.id === selectedId}>
            <span className="hop-n">{i + 1}</span>
            <span className="hop-body">
              <span className="hop-route">
                {labelOf(hop.from)} <span className="arrow">→</span> {labelOf(hop.to)}
              </span>
              <span className="hop-meta">
                <span className="tag">{KIND_LABEL[hop.kind]}</span>
                {hop.note && (
                  <span className="tag" title={hop.note}>
                    stub
                  </span>
                )}
              </span>
            </span>
            {hop.durationMs !== undefined && <span className="mono muted">{hop.durationMs.toFixed(0)} ms</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

const SIGN: Record<DiffRow["status"], string> = { same: "", added: "+", removed: "−", changed: "~" };

export function PayloadDiff({ hop }: { hop?: Hop }) {
  if (!hop) return <p className="empty-note">Select a hop to see what went in and what came out.</p>;
  if (hop.before === undefined && hop.after === undefined) {
    return <p className="empty-note">No payload was captured for this hop.</p>;
  }
  // A function that returns nothing has no "after"; the input is shown as it was, not as removed.
  const oneSided = hop.before === undefined || hop.after === undefined;
  const rows = diffPayload(hop.before, hop.after).map((row): DiffRow => (oneSided ? { ...row, status: "same" } : row));
  return (
    <div className="payload">
      {hop.note && <p className="notice">{hop.note}</p>}
      {oneSided && <p className="hint">{hop.after === undefined ? "The call returned no value." : "No input was captured."}</p>}
      <div className="diff" role="table" aria-label="Payload before and after">
        <div className="diff-head" role="row">
          <span role="columnheader">Before</span>
          <span role="columnheader">After</span>
        </div>
        {rows.map((row) => (
          <div key={row.path} className={`diff-row diff-${row.status}`} role="row">
            <span className="sign" aria-label={row.status === "same" ? undefined : row.status}>
              {SIGN[row.status]}
            </span>
            <span className="diff-path" role="rowheader">
              {row.path}
            </span>
            <span className="diff-before" role="cell">
              {show(row.before)}
            </span>
            <span className="diff-after" role="cell">
              {show(row.after)}
            </span>
          </div>
        ))}
      </div>
      <p className="hint">Secrets are redacted before they leave your app.</p>
    </div>
  );
}
