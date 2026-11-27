#!/usr/bin/env bash
# backup.sh <staging|production> — nightly database dump + media copy (README → Server → Backups).
#
# Installed by hand to /opt/horeca/bin/backup.sh (owner root, mode 755); run by cron as the deploy
# user (deploy/cron.example). Writes to /var/backups/horeca/<env>/{nightly,media}/. Production is the
# one that matters (staging is not backed up by policy); running it once by hand on staging is how the
# script is tested before production exists.
#
#   nightly/db-<UTC timestamp>.dump  pg_dump custom format (restore: pg_restore), whole `horeca` database
#                                    incl. the pg-boss schema; the three logins come from the init
#                                    script. The newest 7 are kept.
#   media/<object key>               object-level copy of the Garage bucket through the S3 API
#                                    (decision 013): `rclone copy` in the one-off `media-backup`
#                                    container (deploy/compose.yml). `copy`, not `sync`: objects deleted
#                                    from the bucket stay here, so this directory only grows (fine at our
#                                    size). Restore = copy back through the S3 API.
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
# The same path is bind-mounted into media-backup (deploy/compose.yml) — keep the two in step.
readonly media_dir="/var/backups/horeca/$env/media"
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
mkdir -p "$out_dir" "$media_dir" # created here, as the deploy user — never by Docker as root
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# Written to *.partial first, renamed only on success: a failed run never looks like a good backup.
log "$env: pg_dump"
compose exec -T postgres pg_dump --username postgres --format custom --dbname horeca \
  >"$out_dir/db-$stamp.dump.partial"
mv "$out_dir/db-$stamp.dump.partial" "$out_dir/db-$stamp.dump"

# rclone runs as this user (files stay owned by deploy) and gets the S3 key only through the
# environment Compose fills in from .env — never on a command line or in this log. rclone copies to a
# temporary name and renames, so an interrupted run never leaves a half-written object; the next run
# fills in what is missing. A non-zero exit (Garage down, wrong key) fails the backup.
log "$env: media copy (S3 → $media_dir)"
compose --profile backup run --rm -T --user "$(id -u):$(id -g)" media-backup

# Keep the newest $KEEP dumps; leftovers from failed runs go too.
prune() {
  find "$out_dir" -maxdepth 1 -type f -name "$1" -printf '%T@ %p\n' |
    sort -rn | tail -n +$((KEEP + 1)) | cut -d' ' -f2- |
    xargs -r rm -f --
}
prune 'db-*.dump'
find "$out_dir" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete

log "$env: done (dumps $(du -sh "$out_dir" | cut -f1), media $(du -sh "$media_dir" | cut -f1))"
