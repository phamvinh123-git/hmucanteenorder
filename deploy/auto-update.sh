#!/bin/sh
# Pulls and deploys by itself when there is a new commit on GitHub (branch main). Run from cron, e.g. every 5 minutes:
#   */5 * * * * /opt/canteen/deploy/auto-update.sh >> /opt/canteen/backups/auto-update.log 2>&1
# It does nothing when there is nothing new, never runs twice at once, and keeps the database untouched.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups

# One run at a time.
exec 9>backups/.auto-update.lock
flock -n 9 || exit 0

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi

echo "$(date '+%F %T') new version $(git rev-parse --short origin/main), updating"
# A fresh backup first, so a bad release can be rolled back with the data as it was.
sh deploy/backup.sh || echo "backup failed, continuing"
git merge --ff-only origin/main
docker compose build app
docker compose up -d app
docker image prune -f >/dev/null 2>&1 || true
echo "$(date '+%F %T') done: $(git log --oneline -1)"
