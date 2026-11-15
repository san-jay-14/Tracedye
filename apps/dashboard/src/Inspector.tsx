import type { ReactNode } from "react";

export type Tab = "hops" | "payload" | "stack";

const TABS: { id: Tab; label: string }[] = [
  { id: "hops", label: "Hops" },
  { id: "payload", label: "Payload" },
  { id: "stack", label: "Call stack" },
];

interface Props {
  open: boolean;
  onToggle: () => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  counts: Partial<Record<Tab, number>>;
  title?: string;
  children: ReactNode;
  footer: ReactNode;
}

// The side panel: one tab at a time so nothing is crowded, and it folds away to give the canvas the room.
export function Inspector({ open, onToggle, tab, onTab, counts, title, children, footer }: Props) {
  return (
    <aside className={open ? "inspector" : "inspector closed"} aria-label="Details">
      <button className="inspector-toggle" onClick={onToggle} aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} title="Toggle details ([)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={open ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} />
        </svg>
      </button>
      {open && (
        <div className="inspector-body">
          <div className="tabs" role="tablist" aria-label="Details">
            {TABS.map(({ id, label }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "tab on" : "tab"} onClick={() => onTab(id)}>
                {label}
                {counts[id] ? <span className="count">{counts[id]}</span> : null}
              </button>
            ))}
          </div>
          {title && <p className="inspector-title">{title}</p>}
          <div className="inspector-scroll" role="tabpanel">
            {children}
            {footer}
          </div>
        </div>
      )}
    </aside>
  );
}
