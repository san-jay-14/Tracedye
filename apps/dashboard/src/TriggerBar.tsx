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
      if (!response.ok) setError(`The collector answered ${response.status}.`);
    } catch {
      setError("The collector is not reachable.");
    }
  }

  return (
    <form
      className="trigger"
      onSubmit={(event) => {
        event.preventDefault();
        if (!armed && name.trim()) void send("arm", name.trim());
      }}
    >
      <input
        value={armed ?? name}
        onChange={(e) => setName(e.target.value)}
        disabled={armed !== null || !connected}
        aria-label="Trigger name"
        placeholder="Name a trigger"
        spellCheck={false}
      />
      {armed === null ? (
        <button type="submit" className="primary" disabled={!connected || !name.trim()}>
          Arm
        </button>
      ) : (
        <button type="button" className="secondary" onClick={() => void send("disarm", armed)}>
          Disarm
        </button>
      )}
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
