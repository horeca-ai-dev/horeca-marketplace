#!/usr/bin/env bash
# deploy.sh — the ONLY thing the deploy SSH key may run (D3-A2; README → Deployment).
#
# Installed by hand to /opt/horeca/bin/deploy.sh (owner root, mode 755). The key in
# ~deploy/.ssh/authorized_keys is forced to run it (command="/opt/horeca/bin/deploy.sh",restrict),
# so the arguments arrive in $SSH_ORIGINAL_COMMAND. Run by hand (as deploy) they come as arguments:
#
#   staging <sha>          pull → migrate → up web + worker (+ mock-services) → wait for /api/health → prune images
#   staging-reset <sha>    the same, after `down --volumes`: DELETES all staging data (database,
#                          search index, Garage with its bucket AND key). The Postgres init script runs
#                          only on an EMPTY volume, so this is also how changed database passwords take
#                          effect. Afterwards run scripts/garage-setup.sh again, put the new S3 key pair
#                          into .env and deploy again (README → One-time server setup → Garage).
#   production <sha>       pull → Postgres up → PRE-DEPLOY pg_dump (newest 5 kept) → migrate → up
#                          web + worker → wait for /api/health → prune. Never a reset. A failed dump stops
#                          the deploy before anything changes. Rollback = the same with the previous SHA
#                          (README → Deployment & releases → Rollback).
#
# <sha> = the full 40-character commit SHA = the image tag CI pushed to GHCR.
# Files: /opt/horeca/deploy/{compose.yml,postgres/init/,garage/garage.toml} (copied from the repo's deploy/ by hand),
#        /opt/horeca/<env>/.env (secrets), /opt/horeca/<env>/deploy.log, /opt/horeca/<env>/deployed-sha,
#        /var/backups/horeca/production/pre-deploy/db-<UTC>-was-<previous sha, 12>.dump (production only).
set -euo pipefail
# Run from / : started with `sudo -u deploy` from another user's home, the inherited working directory
# is unreadable to deploy and find (and others) fail to restore it. Every path below is absolute.
cd /

readonly ROOT=/opt/horeca
readonly DEPLOY_DIR="$ROOT/deploy"
readonly IMAGE_REPO=ghcr.io/horeca-ai-dev/horeca-marketplace
readonly HEALTH_TIMEOUT_S=90
readonly KEEP_IMAGES=5
readonly KEEP_PREDEPLOY_DUMPS=5

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
refuse() {
  # Never echo the request itself back: it is untrusted input.
  echo "deploy.sh: $*" >&2
  exit 2
}

# ── 1. Parse and validate the request ────────────────────────────────────────────────────────────
request="${SSH_ORIGINAL_COMMAND-$*}"
# One strict pattern for the whole line: a word, ONE space, 40 lowercase hex. Nothing else
# (no extra words, newlines, quotes or shell characters) ever reaches the rest of the script.
if [[ ! $request =~ ^([a-z-]+)\ ([0-9a-f]{40})$ ]]; then
  refuse "usage: staging|staging-reset|production <40-hex commit sha>"
fi
action="${BASH_REMATCH[1]}"
sha="${BASH_REMATCH[2]}"

# reset=true exists ONLY for the literal action staging-reset: production can never be reset from here.
case "$action" in
  staging) env=staging reset=false predeploy_dump=false ;;
  staging-reset) env=staging reset=true predeploy_dump=false ;;
  production) env=production reset=false predeploy_dump=true ;;
  *) refuse "unknown environment" ;;
esac

readonly env_dir="$ROOT/$env"
readonly env_file="$env_dir/.env"
[[ -r $env_file ]] || refuse "missing $env_file"
[[ -r $DEPLOY_DIR/compose.yml ]] || refuse "missing $DEPLOY_DIR/compose.yml"

# The web port for the health check: WEB_PORT from the same .env that compose.yml publishes it from
# (127.0.0.1:${WEB_PORT}:3000), so the two can never disagree. Read as text — the .env is never
# sourced (it would run as shell). The last assignment wins, like in Compose; quotes are allowed.
web_port="$(sed -n -E 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*["'\'']?([0-9]+)["'\'']?[[:space:]]*$/\1/p' "$env_file" | tail -n 1)"
[[ $web_port =~ ^[0-9]{2,5}$ ]] || refuse "WEB_PORT missing or not a number in $env_file"

# ── 2. One deploy per environment at a time; everything below goes to the log too ───────────────
exec 9>"$env_dir/deploy.lock"
flock --wait 600 9 || refuse "another $env deploy is still running"
exec > >(tee -a "$env_dir/deploy.log") 2>&1
trap 'log "FAILED: $env $sha (line $LINENO)"' ERR

compose() {
  IMAGE_TAG="$sha" docker compose \
    --project-name "horeca-$env" \
    --env-file "$env_file" \
    --file "$DEPLOY_DIR/compose.yml" \
    "$@"
}

log "START: $env $sha (reset=$reset, pre-deploy dump=$predeploy_dump)"

# ── 3. Pull first: a missing image fails here, before anything is stopped ───────────────────────
compose --profile migrate pull --quiet

if [[ $reset == true ]]; then
  log "reset: removing all $env containers and volumes"
  compose --profile migrate down --volumes --remove-orphans
fi

# ── 4. Infrastructure up (on an empty volume Postgres runs the init script now) ─────────────────
# Only Postgres gates the deploy; Meilisearch, Mailpit and Garage are "degraded" in /api/health, never
# blocking. Garage is NOT waited for: it stays unhealthy until scripts/garage-setup.sh has run once.
# mock-services (supplier stock API; app image, so it is recreated with every new SHA and its in-memory
# stock starts again from the seed data) is started here too and NOT waited for either.
compose up --detach --wait postgres

# ── 4b. Production: dump the database BEFORE migrations touch it ───────────────────────────────
# The whole `horeca` database (incl. the pg-boss schema) as the image's superuser, custom format
# (restore: deploy/restore-test.sh shows how). The file name records the SHA that was running, so a
# rollback knows which image matches the dump. Written to *.partial first and renamed only on
# success; any failure exits here (set -e), before the migration. On the very first deploy the
# volume was empty a moment ago, so this dumps an empty database — harmless.
if [[ $predeploy_dump == true ]]; then
  dump_dir="/var/backups/horeca/$env/pre-deploy"
  previous_sha="none"
  if [[ -r $env_dir/deployed-sha ]]; then
    previous_sha="$(head -c 40 "$env_dir/deployed-sha")"
    [[ $previous_sha =~ ^[0-9a-f]{40}$ ]] || previous_sha="unknown"
  fi
  dump_file="$dump_dir/db-$(date -u +%Y%m%dT%H%M%SZ)-was-${previous_sha:0:12}.dump"
  log "pre-deploy pg_dump → $dump_file"
  (
    umask 077 # dumps contain password hashes and personal data
    mkdir -p "$dump_dir"
    compose exec -T postgres pg_dump --username postgres --format custom --dbname horeca \
      >"$dump_file.partial"
    mv "$dump_file.partial" "$dump_file"
  )
  log "pre-deploy dump: $(du -h "$dump_file" | cut -f1)"
  # Keep the newest $KEEP_PREDEPLOY_DUMPS; leftovers of failed dumps go too.
  find "$dump_dir" -maxdepth 1 -type f -name 'db-*.dump' -printf '%T@ %p\n' |
    sort -rn | tail -n +$((KEEP_PREDEPLOY_DUMPS + 1)) | cut -d' ' -f2- |
    xargs -r rm -f --
  find "$dump_dir" -maxdepth 1 -type f -name '*.partial' -delete
fi

compose up --detach meilisearch mailpit garage mock-services

# ── 5. Migrations (one-off; exits non-zero on failure → the deploy stops, old app keeps running) ─
log "migrate"
compose run --rm -T migrate

if [[ $reset == true ]]; then
  # TODO(seed): run the seed entry here once it exists (pnpm db:seed has no image entry yet).
  log "reset: no seed entry yet — staging starts empty"
fi

# ── 6. New app containers ──────────────────────────────────────────────────────────────────────
compose up --detach --remove-orphans web worker

# ── 7. Health gate: 200 = Postgres + migration version OK ("degraded" still passes) ─────────────
health_url="http://127.0.0.1:$web_port/api/health" # WEB_PORT: staging 3101, production 3102
log "waiting for $health_url (max ${HEALTH_TIMEOUT_S}s)"
deadline=$((SECONDS + HEALTH_TIMEOUT_S))
until body="$(curl --fail --silent --show-error --max-time 5 "$health_url" 2>/dev/null)"; do
  if ((SECONDS >= deadline)); then
    log "health check did not return 200 within ${HEALTH_TIMEOUT_S}s. Last response:"
    curl --silent --max-time 5 "$health_url" || echo "(no response)"
    echo
    compose ps
    compose logs --tail 40 web
    exit 1
  fi
  sleep 3
done
log "health: $body"
printf '%s\n' "$sha" >"$env_dir/deployed-sha"

# ── 8. Prune: keep the newest $KEEP_IMAGES SHA-tagged images (both environments share them) ─────
# `docker image rm` without --force refuses an image a container still uses, so an older SHA that
# production (or a rollback) runs is kept even when it falls outside the newest five.
mapfile -t old_tags < <(
  docker image ls "$IMAGE_REPO" --format '{{.CreatedAt}}|{{.Tag}}' |
    sort --reverse |
    cut -d'|' -f2 |
    grep -E '^[0-9a-f]{40}$' |
    tail -n +$((KEEP_IMAGES + 1))
)
for tag in "${old_tags[@]}"; do
  if docker image rm "$IMAGE_REPO:$tag" >/dev/null 2>&1; then
    log "pruned image $tag"
  else
    log "kept image $tag (still used by a container)"
  fi
done
docker image prune --force >/dev/null # dangling layers only

log "DONE: $env $sha"
