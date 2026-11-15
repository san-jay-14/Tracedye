# One self-contained image for the hosted demo: Postgres, Redis, the sample app (run through the
# real `tracedye dev`, always armed), the collector, the dashboard and a locked-down front server.
# Build from the repo root:  docker build -f deploy/Dockerfile -t tracedye-demo .
#                            docker run -p 7860:7860 tracedye-demo
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql redis-server ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10.22.0

# Hugging Face Spaces run the container as user 1000, which is the image's built-in `node` user.
# Postgres refuses to run as root, so everything runs as that user.
ENV HOME=/home/node
# WORKDIR would create the folder as root, and the node user could not write to it.
RUN mkdir -p /home/node/app && chown node:node /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node . .
USER node

# Only the pieces the demo uses. The dashboard comes along as a dependency of the CLI.
RUN pnpm install --frozen-lockfile --filter "demo..." --filter "sample-app..." --filter "cli..." \
 && pnpm --filter dashboard exec vite build

# Do not set NODE_ENV=production: capture refuses to run there, on purpose.
EXPOSE 7860
CMD ["bash", "deploy/start.sh"]
