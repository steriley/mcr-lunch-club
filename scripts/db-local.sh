#!/usr/bin/env bash
# One-command local database: `pnpm db:local`.
#
# Starts a local Postgres 16 (installed binaries, or Docker with --docker), creates `lunch` (dev) and
# `lunch_test` (integration tests), migrates and imports the site content into `lunch`, seeds a Chair,
# and writes .env.local if there isn't one. Safe to run again: every step checks before it acts.
#
#   pnpm db:local             installed postgres binaries (also what the cloud container uses)
#   pnpm db:local -- --docker docker compose, for laptops
#
# Environment (all optional):
#   LUNCH_PGPORT  port (default 5432)    LUNCH_PGDATA  data directory (binary mode)
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${LUNCH_PGPORT:-5432}"
HOST=127.0.0.1
CHAIR_EMAIL="${SEED_CHAIR_EMAIL:-chair@lunch.test}"
CHAIR_PASSWORD="${SEED_CHAIR_PASSWORD:-local-chair-password}"
DEV_URL="postgres://postgres@$HOST:$PORT/lunch"
TEST_URL="postgres://postgres@$HOST:$PORT/lunch_test"
USE_DOCKER=0
for arg in "$@"; do [ "$arg" = "--docker" ] && USE_DOCKER=1; done

log() { printf '[db:local] %s\n' "$*"; }
warn() { printf '[db:local] warning: %s\n' "$*" >&2; }

# ---- 1. Postgres ---------------------------------------------------------------------------------
if pg_isready -q -h "$HOST" -p "$PORT" 2>/dev/null; then
  log "Postgres already accepting connections on $HOST:$PORT"
elif [ "$USE_DOCKER" = 1 ]; then
  command -v docker >/dev/null || { echo 'docker not found; drop --docker to use installed postgres binaries.' >&2; exit 1; }
  LUNCH_PGPORT="$PORT" docker compose up -d --wait db
else
  BIN=""
  if command -v pg_ctl >/dev/null; then BIN="$(dirname "$(command -v pg_ctl)")"
  else for dir in /usr/lib/postgresql/16/bin /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$dir/pg_ctl" ] && BIN="$dir" && break
  done; fi
  [ -n "$BIN" ] || { echo 'No Postgres binaries found. Install postgresql-16, or run: pnpm db:local -- --docker' >&2; exit 1; }

  # Postgres refuses to run as root, so in a root container it runs as the postgres user.
  RUN=()
  if [ "$(id -u)" = 0 ]; then
    DATA="${LUNCH_PGDATA:-/var/lib/postgresql/mcr-lunch-club/data}"
    RUN=(runuser -u postgres --)
    mkdir -p "$DATA" && chown -R postgres: "$(dirname "$DATA")"
  else
    DATA="${LUNCH_PGDATA:-${XDG_DATA_HOME:-$HOME/.local/share}/mcr-lunch-club/pgdata}"
    mkdir -p "$DATA"
  fi
  chmod 700 "$DATA"
  LOGFILE="$(dirname "$DATA")/postgres.log"

  if [ ! -f "$DATA/PG_VERSION" ]; then
    log "Initialising $DATA"
    "${RUN[@]}" "$BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  log "Starting Postgres on $HOST:$PORT"
  "${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -l "$LOGFILE" -o "-p $PORT -c listen_addresses=$HOST -c unix_socket_directories=/tmp" -w start >/dev/null
fi

# ---- 2. Databases ----------------------------------------------------------------------------------
PSQL=(psql -X -q -h "$HOST" -p "$PORT" -U postgres -d postgres -tA)
for name in lunch lunch_test; do
  if [ "$("${PSQL[@]}" -c "select 1 from pg_database where datname = '$name'")" != 1 ]; then
    log "Creating database $name"
    "${PSQL[@]}" -c "create database $name"
  fi
done

# ---- 3. Schema, content, Chair ---------------------------------------------------------------------
# Explicit variables, so these steps can never touch a database named in an existing .env.local
# (env.ts does not override variables that are already set).
export DATABASE_URL="$DEV_URL" DATABASE_URL_UNPOOLED="$DEV_URL" DATABASE_DRIVER=pg
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-only-secret-at-least-32-characters-long}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:4321}"
export SEED_CHAIR_EMAIL="$CHAIR_EMAIL" SEED_CHAIR_PASSWORD="$CHAIR_PASSWORD" SEED_CHAIR_NAME=Chair
unset NODE_ENV

pnpm --silent db:migrate
pnpm --silent db:import
pnpm --silent db:seed

# ---- 4. .env.local -----------------------------------------------------------------------------------
if [ -e .env.local ]; then
  log ".env.local exists; leaving it alone. For this database use:"
  printf '  DATABASE_URL=%s\n  TEST_DATABASE_URL=%s\n' "$DEV_URL" "$TEST_URL"
else
  cat > .env.local <<ENV
# Written by pnpm db:local. Local-only values; never reuse them anywhere real.
DATABASE_URL=$DEV_URL
DATABASE_URL_UNPOOLED=$DEV_URL
TEST_DATABASE_URL=$TEST_URL
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
BETTER_AUTH_URL=$BETTER_AUTH_URL
SEED_CHAIR_EMAIL=$CHAIR_EMAIL
SEED_CHAIR_PASSWORD=$CHAIR_PASSWORD
ENV
  log "Wrote .env.local"
fi

log "Ready. Sign in at $BETTER_AUTH_URL/admin/login as $CHAIR_EMAIL / $CHAIR_PASSWORD (local only)"
