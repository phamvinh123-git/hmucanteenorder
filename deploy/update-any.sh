#!/bin/sh
# Brings the site on THIS server up to the latest version from GitHub, whatever runs it (pm2, systemd or Docker).
# Run it from the project folder or by its path:   sh deploy/update-any.sh
# It: pulls the code, applies new database migrations, rebuilds, and restarts the web process it can find.
# Add "--check" to only show what it would restart, without changing anything.
set -eu
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

say() { printf '\n== %s\n' "$*"; }

# ------------------------------------------------------------------ how is it run?
RUNNER=""
PM2_NAMES=""
UNIT=""

if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1 && docker compose ps --services --filter status=running 2>/dev/null | grep -q '^app$'; then
  RUNNER="docker"
fi

if [ -z "$RUNNER" ] && command -v pm2 >/dev/null 2>&1; then
  PM2_NAMES="$(pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const root = process.argv[1];
        const names = JSON.parse(s).filter((p) => (p.pm2_env?.pm_cwd || "").startsWith(root) || (p.pm2_env?.pm_cwd || "") === root).map((p) => p.name);
        console.log(names.join(" "));
      } catch { console.log(""); }
    });' "$ROOT" || true)"
  [ -n "$PM2_NAMES" ] && RUNNER="pm2"
fi

if [ -z "$RUNNER" ] && command -v systemctl >/dev/null 2>&1; then
  for u in $(systemctl list-units --type=service --state=running --no-legend 2>/dev/null | awk '{print $1}'); do
    wd="$(systemctl show -p WorkingDirectory --value "$u" 2>/dev/null || true)"
    if [ "$wd" = "$ROOT" ]; then UNIT="$u"; RUNNER="systemd"; break; fi
  done
fi

say "Project folder: $ROOT"
say "How it runs: ${RUNNER:-NOT FOUND}${PM2_NAMES:+ (pm2: $PM2_NAMES)}${UNIT:+ (systemd: $UNIT)}"
if [ -z "$RUNNER" ]; then
  echo "Could not find the process that serves this folder. Run these and send the output:"
  echo "  ps aux | grep -i next | grep -v grep"
  echo "  pm2 list ; systemctl list-units --type=service | grep -i -E 'canteen|next|node'"
  echo "  docker ps"
  exit 1
fi
[ "$CHECK" = "1" ] && { echo "(--check: nothing changed)"; exit 0; }

# ------------------------------------------------------------------ update
say "Pulling the latest code"
git fetch --quiet origin main
BEFORE="$(git rev-parse --short HEAD)"
git merge --ff-only origin/main
echo "$BEFORE -> $(git rev-parse --short HEAD)"

if [ "$RUNNER" = "docker" ]; then
  say "Rebuilding the Docker image"
  docker compose build app
  docker compose up -d app
  docker compose ps
  exit 0
fi

say "Installing packages"
npm ci

say "Generating the database client and applying migrations"
npx prisma generate
npx prisma migrate deploy

say "Building"
npm run build

say "Restarting"
if [ "$RUNNER" = "pm2" ]; then
  # shellcheck disable=SC2086
  pm2 restart $PM2_NAMES --update-env
  pm2 save >/dev/null 2>&1 || true
  pm2 list
else
  sudo systemctl restart "$UNIT"
  systemctl --no-pager status "$UNIT" | head -8
fi

say "Done: $(git log --oneline -1)"
