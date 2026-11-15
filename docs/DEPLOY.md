# Hosted demo

A public page where anyone can press **Simulate login** and watch one real login move through a sample app, with the payload at every hop. It runs as one Docker image, so it can go anywhere Docker runs. The free options are below, with what each one costs you.

## What runs inside

One container holds everything: Postgres and Redis, the sample app (started through the real `tracedye dev`, always armed), the collector, the dashboard, and a small public front server on port 7860.

The public side is deliberately narrow. A visitor can load the dashboard, read stored triggers, watch the live stream and press the button. They cannot arm or disarm, send events, replace the map or send spans. The button does a real login on the server (the demo credentials never reach the browser), one at a time, with a gap between clicks and a cap per minute. One login runs by itself at start-up, so the first visitor sees a captured request straight away.

The LLM hop is a stub, because no API key is set, and the page says so.

## Try the image on your computer

```bash
docker build -f deploy/Dockerfile -t tracedye-demo .
docker run --rm -p 7860:7860 tracedye-demo
```

Open http://localhost:7860 and press **Simulate login**.

## Option 1: your own computer, shared with a Cloudflare tunnel (free, no account)

The quickest way to get a public link. A [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) needs no Cloudflare account and no card. Anyone with the link can open the demo for as long as your computer and the tunnel are running. The link changes every time you start the tunnel, and Cloudflare gives no uptime guarantee for quick tunnels.

1. Install the tunnel program once (Windows): `winget install --id Cloudflare.cloudflared`. On other systems, see Cloudflare's install page.
2. Start the demo:
   ```bash
   docker run -d --name tracedye-demo -p 7860:7860 tracedye-demo
   ```
3. Start the tunnel, and leave it running:
   ```bash
   cloudflared tunnel --url http://localhost:7860
   ```
   It prints a link ending in `.trycloudflare.com`. That is the public address.
4. Stop sharing with Ctrl+C in the tunnel window, and `docker rm -f tracedye-demo` to stop the demo.

The demo needs about 600 MB of memory, and a visitor can only load the page, read what was captured, and press the button (see "What runs inside").

## Option 2: a small always-on server

The image needs a machine with at least 1 GB of free memory. Oracle's Always Free VM is one that fits, though it asks for a card for identity checks, and its free allowance was reduced in 2026. On any Linux server with Docker:

```bash
git clone https://github.com/san-jay-14/Tracedye.git && cd Tracedye
docker build -f deploy/Dockerfile -t tracedye-demo .
docker run -d --restart unless-stopped --name tracedye-demo -p 80:7860 tracedye-demo
```

Put a TLS front in front of it (for example Caddy, or a Cloudflare tunnel) before sharing the address.

## Not free: 512 MB hosts

The image runs Postgres, Redis and three Node processes and sits at about 530 to 610 MB, so the smallest free tiers (Render's 512 MB, Back4App's 256 MB) are too small for it.

## Option 3: Hugging Face Spaces (reported to need a paid plan for Docker)

Hugging Face's own documentation lists Docker Spaces on free CPU hardware, but at least one user was told Docker Spaces need a Pro plan. If yours do, use option 1 or 2.

1. **Make an account** at huggingface.co, then create a **Space**: SDK **Docker**, hardware **CPU basic**, visibility **Public**. Name it, for example, `tracedye-demo`.
2. **Make a write token** at huggingface.co/settings/tokens (type "Write"). You use it as the password when you push.
3. **Stage the files** from this repo (commit first):
   ```bash
   node deploy/huggingface/prepare.mjs
   ```
4. **Push them to the Space:**
   ```bash
   cd deploy/huggingface/space
   git init -b main
   git add .
   git commit -m "Tracedye demo"
   git remote add space https://huggingface.co/spaces/<your-username>/tracedye-demo
   git push space main
   ```
   When asked, the username is your Hugging Face username and the password is the write token.
5. **Wait for the build.** The Space page shows the build log; the first build takes several minutes. When it says **Running**, the demo is at `https://<your-username>-tracedye-demo.hf.space`.

To update it later, run the prepare script again and push again.

## Good to know

- **It sleeps.** A free Space goes to sleep after 48 hours without visitors and wakes on the next visit, which takes about a minute while Postgres, Redis and the app start. Free-tier limits change, so check Hugging Face's current docs.
- **The data resets.** The disk is not persistent; every start begins with a fresh database. That is fine for a demo.
- **Cost of a click.** Each press runs a real login (about 150 ms of password hashing) and stores a few kilobytes. The limits keep that small. If a click says "wait a moment", the limit is working.
- **If it won't start,** open the Space's **Logs** tab. The most common cause is a failed build step; the log shows which.
- **Not production.** Tracedye refuses to run with `NODE_ENV=production` on purpose, so the image never sets it. This is a demo of a dev tool.
