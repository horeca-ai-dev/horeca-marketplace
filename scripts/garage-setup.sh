#!/usr/bin/env bash
# One-time Garage setup for an environment (decision 013). Safe to run again: every step checks first.
#   1. node layout: one zone, one node (only while the layout version is 0)
#   2. bucket horeca-media
#   3. access key horeca-app — its ID and secret are printed ONCE, when the key is created
#   4. the key gets read + write on the bucket (and nothing else)
#
# Runs the Garage CLI inside the running `garage` container (`docker compose exec`), so the CLI uses
# the container's config and GARAGE_RPC_SECRET. Commands checked against Garage v2.5.0 (`garage <cmd> --help`).
#
# Local:   scripts/garage-setup.sh                 (uses docker-compose.dev.yml)
# Server:  COMPOSE_FILE=… COMPOSE_PROJECT_NAME=horeca-<env> scripts/garage-setup.sh
#          (Compose reads both variables itself; set up on the server with the D5 task)
# Options (env): GARAGE_BUCKET (horeca-media), GARAGE_KEY_NAME (horeca-app), GARAGE_ZONE (dc1),
#                GARAGE_CAPACITY (1G — the node's share of the layout; Garage uses it to place data)
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows: keep /garage as a container path

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
bucket="${GARAGE_BUCKET:-horeca-media}"
key_name="${GARAGE_KEY_NAME:-horeca-app}"
zone="${GARAGE_ZONE:-dc1}"
capacity="${GARAGE_CAPACITY:-1G}"

garage() {
  docker compose exec -T garage /garage "$@"
}

# --- 1. Layout ---------------------------------------------------------------------------------
layout="$(garage layout show)"
version="$(sed -n 's/^Current cluster layout version: \([0-9][0-9]*\)$/\1/p' <<<"$layout")"
if [[ -z "$version" ]]; then
  echo "Could not read the layout version from 'garage layout show':" >&2
  echo "$layout" >&2
  exit 1
fi
if [[ "$version" == "0" ]]; then
  node_id="$(garage node id -q | cut -d@ -f1)"
  garage layout assign -z "$zone" -c "$capacity" "$node_id" >/dev/null
  garage layout apply --version 1 >/dev/null
  echo "Layout: node ${node_id:0:16} assigned to zone $zone ($capacity), version 1 applied."
else
  echo "Layout: already applied (version $version), unchanged."
fi

# Bucket and key operations need a healthy cluster; it becomes healthy right after the layout.
for _ in $(seq 1 30); do
  if garage health >/dev/null 2>&1; then break; fi
  sleep 1
done
garage health >/dev/null

# --- 2. Bucket ---------------------------------------------------------------------------------
if out="$(garage bucket info "$bucket" 2>&1)"; then
  echo "Bucket: $bucket exists, unchanged."
elif grep -q NoSuchBucket <<<"$out"; then
  garage bucket create "$bucket" >/dev/null
  echo "Bucket: $bucket created."
else
  echo "$out" >&2
  exit 1
fi

# --- 3. Access key -----------------------------------------------------------------------------
# Key names are NOT unique in Garage, so create one only if none with this name exists.
# Any other error (e.g. "2 matching keys") stops the script instead of creating yet another key.
created_key=""
if out="$(garage key info "$key_name" 2>&1)"; then
  echo "Key: $key_name exists, unchanged (its secret is not printed again)."
elif grep -q NoSuchAccessKey <<<"$out"; then
  created_key="$(garage key create "$key_name")"
  echo "Key: $key_name created."
else
  echo "$out" >&2
  exit 1
fi

# --- 4. Permissions (setting the same permissions again is a no-op) ------------------------------
garage bucket allow --read --write "$bucket" --key "$key_name" >/dev/null
echo "Permissions: $key_name may read and write $bucket."

if [[ -n "$created_key" ]]; then
  key_id="$(sed -n 's/^Key ID: *//p' <<<"$created_key")"
  secret="$(sed -n 's/^Secret key: *//p' <<<"$created_key")"
  if [[ -z "$key_id" || -z "$secret" ]]; then
    echo "Key created, but its ID / secret could not be read. Show it with:" >&2
    echo "  COMPOSE_FILE=$COMPOSE_FILE docker compose exec garage /garage key info --show-secret $key_name" >&2
    exit 1
  fi
  echo
  echo "Put these two lines into the environment's .env — they are shown only this once:"
  echo "S3_ACCESS_KEY_ID=$key_id"
  echo "S3_SECRET_ACCESS_KEY=$secret"
else
  echo
  echo "Lost the secret? COMPOSE_FILE=$COMPOSE_FILE docker compose exec garage /garage key info --show-secret $key_name"
fi
