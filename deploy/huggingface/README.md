---
title: Tracedye demo
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Watch one real login move through a TypeScript app.
---

# Tracedye demo

Press **Simulate login** and watch one real login move through a small TypeScript app: the request, Postgres, an LLM call (a stub here), Redis and the WebSocket push back to the browser, with the data at every hop.

This Space runs [Tracedye](https://github.com/san-jay-14/Tracedye) on a sample app with real Postgres and Redis. Tracedye supports TypeScript on Node with Express. It is a dev-time tool, shown here on a demo app.
