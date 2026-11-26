# 013 — S3-compatible storage via self-hosted Garage

Date 26.11.2026 · Author @BogdanD3 with Claude · **Status: accepted** · Replaces decision J (media on a Docker volume)

## Context
The mentor asked for S3-compatible object storage instead of files on the server's file system: "standard practice from the start, not hard to implement, almost always the better choice." Decision J stored product images and invoice PDFs on a Docker volume behind one storage module, so only that module and the infrastructure change.

## Decision
- **The app uses only the S3 API** (standard S3 client library, exact pinned version) inside `src/server/storage` — `put`, `get` (stream), `delete`, `head`, `list`. No code reads or writes media on the file system any more.
- **Storage service: Garage** (self-hosted, S3-compatible, actively maintained; MinIO was archived in April 2026), **one Garage container per environment** (local, staging, production), single node, replication factor 1.
- **Pattern: through the app** (unchanged from J): uploads go browser → our route handler → Garage; images and PDFs are served by our media / download route handlers (login required, `Cache-Control: private`). **Garage is internal only:** no public endpoint, no `ports:` entry on the server, nothing for the public proxy, Tailscale or Nginx. Locally its S3 port is bound to `127.0.0.1` for tools.
- **One bucket per environment** (`horeca-media`), **one access key** for the app with read/write on that bucket only; web and worker both use it.
- **Configuration** (runtime, via `src/env.core.ts`): `S3_ENDPOINT`, `S3_REGION` (Garage's configured region, e.g. `garage`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true`. `MEDIA_DIR` is removed.
- **Object keys** follow J's convention: `products/<image id>/original`, `products/<image id>/<320|640|1280>.webp`, `invoices/<order id>.pdf`.
- **Garage setup** (once per environment, idempotent script in the repo): configure the node layout (single zone, capacity), create the bucket, create the key, allow the key read/write on the bucket; print the key ID and secret once for the `.env`. Garage's own secrets (`rpc_secret`, `admin_token`) come from the environment's `.env`, never from git. Commands must be verified against the pinned Garage 2.x documentation.
- **Tests:** integration tests run against a real Garage container (Testcontainers), like PostgreSQL and Meilisearch.
- **Backups:** nightly, object-level copy of the bucket through the S3 API (e.g. an `rclone sync` in a one-off container) into `/var/backups/horeca/<env>/media/`, instead of archiving a live volume. Restore = copy back through the S3 API.

## Moving off the server later (the reason this is cheap)
Change `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` and the keys in `.env` to an external provider (Cloudflare R2, Backblaze B2, AWS S3 …) and copy the existing objects once (`rclone sync`). No code change — well under a day. Direct browser uploads with presigned URLs would be an optional later improvement (public endpoint + CORS).

## Consequences
| Area | Change |
|---|---|
| Local dev (`docker-compose.dev.yml`) | + Garage service, config, setup script; `.env.example` S3 variables |
| Server (`deploy/compose.yml`, env examples) | + Garage service per environment (no ports, memory limit ≈ 128m, volumes for data + meta); setup script run once; S3 variables in `/opt/horeca/<env>/.env`; `MEDIA_DIR` volume removed from web/worker |
| Storage module (Member B) | S3 client instead of file system; image job reads the original from S3 and writes the 3 WebP sizes back; invoice job stores the PDF in S3; download / media routes stream from S3 |
| Health | Garage reported as "degraded" when unreachable (not blocking), like Meilisearch |
| Backups | `backup.sh`: media via S3-API copy instead of a volume archive |
| Docs | README (stack, env table, server, backups, key decisions + rejected alternatives), CLAUDE.md (stack, media rule), DESIGN.md (no change to the UI), TASKS, `APPLIED.md` note (decision J superseded), specification |

## Plan changes
| Task | Owner | Change | Time |
|---|---|---|---|
| D4 (new) | A | Garage in `docker-compose.dev.yml` + setup script + `.env.example` + Testcontainers helper image/config | 1.5h |
| D5 with D5-A1 | A | Garage in `deploy/compose.yml` for staging and production, setup on the server, S3 variables in both `.env` files, `backup.sh` media via S3 API | 1.5h |
| D5-B3 | B | storage module on the S3 API (instead of the volume) | +0.5h |
| D6-B1 | B | image job via S3 | +0.5h |
| D3/D5 tests | B | Garage container in the integration setup | +0.5h |

## Alternatives rejected
Docker volume (decision J — not object storage) · MinIO (archived April 2026) · cloud bucket now (external account and card; possible later by configuration) · presigned direct uploads now (needs a public storage endpoint and CORS; not needed for the demo).
