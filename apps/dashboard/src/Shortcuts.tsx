const KEYS: [string, string][] = [
  ["Space", "Play or pause"],
  ["← →", "Step back or forward"],
  ["/", "Find a function"],
  ["[", "Show or hide details"],
  ["Esc", "Clear the focused node"],
  ["?", "This list"],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <dl>
          {KEYS.map(([key, what]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
