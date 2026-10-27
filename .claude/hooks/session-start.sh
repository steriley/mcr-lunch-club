#!/usr/bin/env bash
# Claude Code cloud sessions: install dependencies and bring up the local database, so `pnpm build`,
# `pnpm test:db` and `pnpm check:built` work from the first prompt. Quick when everything already exists.
# Never fails the session: if Postgres can't start it warns, and the session carries on without it.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Only the ephemeral cloud container; on a laptop run `pnpm db:local` yourself.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

pnpm install --frozen-lockfile --prefer-offline || echo "warning: pnpm install failed; run it by hand." >&2

if pnpm db:local; then
  echo "Local database ready. Build with: pnpm build   Check the build with: pnpm check:built"
else
  echo "warning: pnpm db:local failed, so there is no local database. pnpm build and pnpm test:db need one; see CLAUDE.md." >&2
fi
exit 0
