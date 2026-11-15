#!/usr/bin/env bash
# Starts everything the demo needs inside one container, then keeps running while all of it does.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="$(ls -d /usr/lib/postgresql/*/bin | head -1)"
PGDATA="$HOME/pgdata"
mkdir -p "$PGDATA" /tmp/tracedye

# Postgres: a fresh database each start. The demo's data doesn't need to survive a restart.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$PGDATA" -U sample --auth=trust > /dev/null
fi
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c fsync=off" -l /tmp/postgres.log -w start > /dev/null
createdb -h 127.0.0.1 -U sample sample 2> /dev/null || true
if [ -z "$(psql -h 127.0.0.1 -U sample -d sample -tAc "SELECT to_regclass('public.users')")" ]; then
  psql -h 127.0.0.1 -U sample -d sample -q -f apps/sample-app/db/init.sql
fi

# Redis: in memory only.
redis-server --bind 127.0.0.1 --save "" --appendonly no --daemonize yes > /dev/null

# The sample app, through tracedye: collector, map and capture. The trigger is armed from the start,
# so every login the demo does is captured. Port 3001 is only reachable from inside the container.
(
  cd apps/sample-app
  DATABASE_URL="postgres://sample@127.0.0.1:5432/sample" REDIS_URL="redis://127.0.0.1:6379" PORT=3001 \
    exec node ../../packages/cli/bin/tracedye.mjs dev --tsconfig server/tsconfig.json --no-dashboard \
      --port 4318 --data-dir /tmp/tracedye --arm "user login" -- ./node_modules/.bin/tsx server/index.ts
) &

# The public side: the dashboard, a read-only view of the collector, and the Simulate login button.
(
  cd apps/demo
  PORT=7860 exec ./node_modules/.bin/tsx src/main.ts
) &

# If either one stops, stop the container, so the host restarts it instead of leaving half a demo up.
wait -n
echo "a demo process exited; stopping" >&2
exit 1
