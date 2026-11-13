import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The collector is reached through this proxy, so the browser sees one origin and the
// collector needs no CORS handling. Override the target with COLLECTOR_URL.
const collector = process.env.COLLECTOR_URL ?? "http://localhost:4318";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/collector": {
        target: collector,
        ws: true,
        rewrite: (path) => path.replace(/^\/collector/, ""),
      },
    },
  },
});
