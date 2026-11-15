import { BACKEND, expandedFor, levelOf, type Hierarchy, type Level } from "./abstraction";

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "system", label: "System", hint: "The backend as one box" },
  { id: "apis", label: "APIs", hint: "One box per route" },
  { id: "functions", label: "Functions", hint: "Every function" },
];

interface Props {
  hierarchy: Hierarchy;
  expanded: ReadonlySet<string>;
  onChange: (expanded: Set<string>) => void;
  onClose: (id: string) => void;
}

// How much detail the canvas shows. The three levels are shortcuts; boxes can also be opened one at a
// time by clicking them, and each open box is listed here so it can be closed again.
export function LevelBar({ hierarchy, expanded, onChange, onClose }: Props) {
  const level = levelOf(hierarchy, expanded);
  const open = [...expanded].filter((id) => hierarchy.groups.has(id));
  const custom = level === undefined && open.length > 0;

  return (
    <div className="levels">
      <div className="level-switch" role="radiogroup" aria-label="Level of detail">
        {LEVELS.map(({ id, label, hint }) => (
          <button key={id} role="radio" aria-checked={level === id} className={level === id ? "on" : undefined} title={hint} onClick={() => onChange(expandedFor(hierarchy, id))}>
            {label}
          </button>
        ))}
      </div>
      {level === "system" && <p className="level-hint">Click the Backend box to open it.</p>}
      {custom && (
        <ul className="open-groups" aria-label="Open boxes">
          {open.map((id) => (
            <li key={id}>
              <button onClick={() => onClose(id)} title={id === BACKEND ? "Close the backend" : "Close this box"}>
                {hierarchy.groups.get(id)?.label}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
