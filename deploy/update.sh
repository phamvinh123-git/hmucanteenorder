#!/bin/sh
# Brings the site up to the latest version from GitHub (database is untouched, migrations run on start).
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build app
docker compose up -d app
docker compose ps
