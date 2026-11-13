import { useState } from "react";

const BASE = "/collector"; // proxied to the collector by vite.config.ts

// Arms a trigger by name, so the next thing the app does is captured. Disarmed, wrapped
// functions do nothing and cost almost nothing.
export function TriggerBar({ armed, connected }: { armed: string | null; connected: boolean }) {
  const [name, setName] = useState("my trigger");
  const [error, setError] = useState<string>();

  async function send(action: "arm" | "disarm", triggerName: string) {
    setError(undefined);
    try {
      const response = await fetch(`${BASE}/triggers/${encodeURIComponent(triggerName)}/${action}`, { method: "POST" });
      if (!response.ok) setError(`collector answered ${response.status}`);
    } catch {
      setError("collector not reachable");
    }
  }

  return (
    <form
      className="trigger-bar"
      onSubmit={(event) => {
        event.preventDefault();
        if (!armed && name.trim()) void send("arm", name.trim());
      }}
    >
      <label>
        Trigger
        <input value={armed ?? name} onChange={(e) => setName(e.target.value)} disabled={armed !== null || !connected} aria-label="Trigger name" />
      </label>
      {armed === null ? (
        <button type="submit" disabled={!connected || !name.trim()}>
          Arm
        </button>
      ) : (
        <button type="button" onClick={() => void send("disarm", armed)}>
          Disarm
        </button>
      )}
      {error && <span className="trigger-error">{error}</span>}
    </form>
  );
}
