# Hosted demo

A public page where anyone can press **Simulate login** and watch one real login move through a sample app, with the payload at every hop. It runs as one Docker image on a free [Hugging Face Space](https://huggingface.co/docs/hub/spaces-sdks-docker).

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

## Put it on Hugging Face Spaces

1. **Make an account** at huggingface.co (free, no card), then create a **Space**: SDK **Docker**, hardware **CPU basic (free)**, visibility **Public**. Name it, for example, `tracedye-demo`.
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
