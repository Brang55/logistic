#!/bin/sh
# Nightly backup of the database and uploaded documents; keeps the last 14 of each.
# Cron example: 0 3 * * * cd /opt/logistic && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/logistic-$(date +%Y%m%d-%H%M%S).dump"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db pg_dump -U logistic -Fc logistic > "$file"
echo "Wrote $file"
# Uploaded document scans (truck/trailer papers).
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api tar -cz -C /app uploads > "backups/uploads-$(date +%Y%m%d-%H%M%S).tgz"
ls -1t backups/logistic-*.dump | tail -n +15 | xargs -r rm --
ls -1t backups/uploads-*.tgz | tail -n +15 | xargs -r rm --
