import { useEffect, useState } from "react";

// A hosted demo answers /demo/config; anywhere else it is a 404, and the page behaves normally.
export function useDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch("/demo/config")
      .then((response) => (response.ok ? response.json() : undefined))
      .then((config) => setDemo(config?.simulate === true))
      .catch(() => setDemo(false));
  }, []);
  return demo;
}
