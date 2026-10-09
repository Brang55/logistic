#!/bin/sh
# Nightly database backup for the production stack; keeps the last 14 dumps.
# Cron example: 0 3 * * * cd /opt/logistic && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/logistic-$(date +%Y%m%d-%H%M%S).dump"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db pg_dump -U logistic -Fc logistic > "$file"
echo "Wrote $file"
ls -1t backups/logistic-*.dump | tail -n +15 | xargs -r rm --
