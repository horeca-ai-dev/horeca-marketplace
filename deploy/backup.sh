#!/usr/bin/env bash
# backup.sh <staging|production> — nightly database dump + media archive (README → Server → Backups).
#
# Installed by hand to /opt/horeca/bin/backup.sh (owner root, mode 755); run by cron as the deploy
# user (deploy/cron.example). Writes to /var/backups/horeca/<env>/nightly/ and keeps the newest 7 of
# each kind. Production is the one that matters (staging is not backed up by policy); running it once
# by hand on staging is how the script is tested before production exists.
#
#   db-<UTC timestamp>.dump        pg_dump custom format (restore: pg_restore), whole `horeca` database
#                                  incl. the pg-boss schema; the three logins come from the init script
#   media-<UTC timestamp>.tar.gz   the media volume (product images, invoice PDFs)
#
# TODO(D5-A1): pre-deploy dumps (keep 5) are taken by deploy.sh production, not here.
# Meilisearch is not backed up: it is rebuilt from Postgres (pnpm search:reindex).
set -euo pipefail

readonly ROOT=/opt/horeca
readonly KEEP=7

env="${1-}"
case "$env" in
  staging | production) ;;
  *)
    echo "usage: backup.sh <staging|production>" >&2
    exit 2
    ;;
esac

readonly env_dir="$ROOT/$env"
readonly out_dir="/var/backups/horeca/$env/nightly"
[[ -r $env_dir/deployed-sha ]] || {
  echo "backup.sh: $env has never been deployed ($env_dir/deployed-sha missing)" >&2
  exit 1
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
compose() {
  IMAGE_TAG="$(<"$env_dir/deployed-sha")" docker compose \
    --project-name "horeca-$env" \
    --env-file "$env_dir/.env" \
    --file "$ROOT/deploy/compose.yml" \
    "$@"
}

umask 077 # dumps contain password hashes and personal data
mkdir -p "$out_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# Written to *.partial first, renamed only on success: a failed run never looks like a good backup.
log "$env: pg_dump"
compose exec -T postgres pg_dump --username postgres --format custom --dbname horeca \
  >"$out_dir/db-$stamp.dump.partial"
mv "$out_dir/db-$stamp.dump.partial" "$out_dir/db-$stamp.dump"

# Through the running web container (it mounts the volume read-write; tar only reads) — no extra image.
log "$env: media archive"
compose exec -T web tar -C /data/media -czf - . >"$out_dir/media-$stamp.tar.gz.partial"
mv "$out_dir/media-$stamp.tar.gz.partial" "$out_dir/media-$stamp.tar.gz"

# Keep the newest $KEEP of each kind; leftovers from failed runs go too.
prune() {
  find "$out_dir" -maxdepth 1 -type f -name "$1" -printf '%T@ %p\n' |
    sort -rn | tail -n +$((KEEP + 1)) | cut -d' ' -f2- |
    xargs -r rm -f --
}
prune 'db-*.dump'
prune 'media-*.tar.gz'
find "$out_dir" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete

log "$env: done ($(du -sh "$out_dir" | cut -f1) in $out_dir)"
