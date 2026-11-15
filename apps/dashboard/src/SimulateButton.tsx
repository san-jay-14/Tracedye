import { useState } from "react";

// The demo's one control: it asks the server to do a real login against the sample app.
// The dashboard then shows it as it happens, the same as any captured request.
export function SimulateButton({ connected }: { connected: boolean }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  async function simulate() {
    setRunning(true);
    setError(undefined);
    try {
      const response = await fetch("/demo/simulate", { method: "POST" });
      if (!response.ok) setError(((await response.json()) as { error?: string }).error ?? "The login did not go through.");
    } catch {
      setError("The demo server is not reachable.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="trigger">
      <button className="primary" onClick={() => void simulate()} disabled={!connected || running}>
        {running ? "Logging in…" : "Simulate login"}
      </button>
      <span className="demo-hint">A real login against a sample app</span>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
