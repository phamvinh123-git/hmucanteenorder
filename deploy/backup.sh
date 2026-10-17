#!/bin/sh
# Daily database backup. Add to cron, e.g.:  0 2 * * * /opt/canteen/deploy/backup.sh >> /opt/canteen/backups/backup.log 2>&1
# Keeps 30 days. Copy the folder "backups" to another machine from time to time.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
FILE="backups/canteen-$(date +%Y-%m-%d-%H%M).dump"
docker compose exec -T db pg_dump -U canteen -Fc canteen > "$FILE"
find backups -name 'canteen-*.dump' -mtime +30 -delete
echo "$(date '+%F %T') saved $FILE ($(du -h "$FILE" | cut -f1))"
