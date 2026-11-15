import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "./graph";

// Find a function by name and jump to it. Press / anywhere to start typing.
export function SearchBox({ nodes, onPick }: { nodes: GraphNode[]; onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
      if (e.key === "/" && !typing) (e.preventDefault(), input.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = text.trim().toLowerCase();
  const found = query ? nodes.filter((n) => n.label.toLowerCase().includes(query)).slice(0, 8) : [];

  const pick = (id: string) => {
    onPick(id);
    setText("");
    input.current?.blur();
  };

  return (
    <div className="search">
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && found[0]) pick(found[0].id);
          if (e.key === "Escape") (setText(""), input.current?.blur());
        }}
        placeholder="Find a function  /"
        aria-label="Find a function"
      />
      {query && (
        <ul className="search-results" role="listbox">
          {found.length === 0 && <li className="none">No match in this request</li>}
          {found.map((n) => (
            <li key={n.id}>
              <button role="option" aria-selected={false} onClick={() => pick(n.id)}>
                {n.label}
                <small>{n.file ? `${n.file.split("/").pop()}:${n.line}` : n.kind}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
