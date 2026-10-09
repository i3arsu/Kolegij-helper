#!/bin/sh
# Dnevni backup baze i predanih datoteka. Pokreće ga cron na poslužitelju, npr.:
#   15 2 * * * cd /srv/pracenje && ./scripts/backup.sh >> backups/backup.log 2>&1
# Rotacija: 7 dnevnih, 4 tjedna (nedjelja), 6 mjesečnih (1. u mjesecu).
# Odredišni direktorij treba se sinkronizirati na drugu lokaciju (rsync/restic).
set -eu
ODREDISTE=${ODREDISTE:-./backups}
DATUM=$(date +%F)
mkdir -p "$ODREDISTE/dnevni" "$ODREDISTE/tjedni" "$ODREDISTE/mjesecni"

docker compose exec -T db pg_dump -U postgres -Fc pracenje > "$ODREDISTE/dnevni/baza-$DATUM.dump"
docker run --rm -v pracenje_datoteke:/data:ro -v "$(cd "$ODREDISTE" && pwd)/dnevni":/out alpine \
  tar czf "/out/datoteke-$DATUM.tar.gz" -C /data .

[ "$(date +%u)" = 7 ] && cp "$ODREDISTE/dnevni/"*"-$DATUM"* "$ODREDISTE/tjedni/"
[ "$(date +%d)" = 01 ] && cp "$ODREDISTE/dnevni/"*"-$DATUM"* "$ODREDISTE/mjesecni/"

find "$ODREDISTE/dnevni" -type f -mtime +7 -delete
find "$ODREDISTE/tjedni" -type f -mtime +28 -delete
find "$ODREDISTE/mjesecni" -type f -mtime +186 -delete
echo "$(date -Is) backup gotov"
