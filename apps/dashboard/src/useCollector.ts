import type { CollectorEvent, MapData, StreamMessage } from "collector/src/types";
import { useEffect, useState } from "react";

const BASE = "/collector"; // proxied to the collector by vite.config.ts
const RECONNECT_MS = 1000;

export interface CollectorState {
  connected: boolean;
  map: MapData;
  // Triggers already stored when the page connected, and events that arrived live since.
  // Only live events are animated.
  stored: CollectorEvent[];
  live: CollectorEvent[];
  armed: string | null;
}

// Follows the collector's /stream: the current map, then live events. On every connect
// it also loads the triggers already stored, so a fresh page still shows what ran before.
export function useCollector(): CollectorState {
  const [connected, setConnected] = useState(false);
  const [map, setMap] = useState<MapData>({ nodes: [], edges: [] });
  const [stored, setStored] = useState<CollectorEvent[]>([]);
  const [live, setLive] = useState<CollectorEvent[]>([]);
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function loadStored() {
      const triggers: { id: string }[] = await (await fetch(`${BASE}/triggers`)).json();
      const events = await Promise.all(
        triggers.map(async (t): Promise<CollectorEvent[]> => (await fetch(`${BASE}/triggers/${encodeURIComponent(t.id)}/events`)).json()),
      );
      if (!stopped) setStored(events.flat());
    }

    function connect() {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${location.host}${BASE}/stream`);
      socket.onopen = () => {
        setConnected(true);
        loadStored().catch(() => {});
      };
      socket.onmessage = (message) => {
        const data: StreamMessage = JSON.parse(message.data);
        if (data.type === "map") setMap({ nodes: data.nodes, edges: data.edges });
        else if (data.type === "event") setLive((all) => [...all, data.event]);
        else setArmed(data.armed);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, RECONNECT_MS);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { connected, map, stored, live, armed };
}
