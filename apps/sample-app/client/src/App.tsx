import { useEffect, useRef, useState } from "react";

interface LoginOk {
  type: "login_ok";
  triggerId?: string;
  key: string;
  user: { id: number; plan: string; segment: string };
}

export function App() {
  const clientId = useRef(crypto.randomUUID());
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo-password");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoginOk | null>(null);

  // Open the socket up front so the server can push the result back.
  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws?clientId=${clientId.current}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "login_ok") setResult(message);
    };
    return () => socket.close();
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, clientId: clientId.current }),
    });
    if (!response.ok) setError((await response.json()).error ?? "login failed");
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 360, margin: "4rem auto" }}>
      <h1>Sample app</h1>
      <form onSubmit={login} style={{ display: "grid", gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />
        <button type="submit">Log in</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && (
        <pre data-testid="login-result">{JSON.stringify(result, null, 2)}</pre>
      )}
    </main>
  );
}
