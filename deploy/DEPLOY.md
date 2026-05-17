# HJ Account AI — Production deploy runbook

**Target**: Ubuntu host with existing Docker stack including Nginx Proxy Manager (NPM). Deploy path `/DATA/AppData/www/mini_acc`. Domain `accounting.cnppai.com` (TLS handled by NPM).

Architecture: 4 services on a private bridge (`hj-net`). Only `web` (host port 9930) and `api` (host port 9931) expose ports to the host — NPM proxies them. `db` + `redis` stay internal.

```
       Internet
           │
       ┌───▼────────────────────┐
       │ Nginx Proxy Manager    │  :80 :443 (already running)
       │ (jc21/nginx-proxy-...) │  Let's Encrypt cert per domain
       └───┬────────────────────┘
           │ accounting.cnppai.com
           │   /         → host:9930 (web container)
           │   /api/     → host:9931 (api container)
           ▼
    ┌──────────────────┐
    │ host (Ubuntu)    │
    │  :9930  :9931    │
    │   web    api     │
    │           │      │
    │     ┌─────▼─────┐│
    │     │ db  redis ││  (internal — no host ports)
    │     └───────────┘│
    └──────────────────┘
           │ daily 02:00 Bangkok
       ┌───▼────┐
       │ backup │   ./backup/YYYY-MM-DD.sql.gz (retain 14d)
       └────────┘
```

> **Port allocation:** the host is already busy. We use `9930` (web) and `9931` (api) — both verified free as of deploy. If anything else takes them later, pick the next free pair in 9930–9960 and update `docker-compose.prod.yml` + NPM config.

---

## 0. Prerequisites

This is a one-time setup. Skip parts you already have.

```bash
# Docker + Compose v2 — you already have these (NPM proves it)
docker compose version

# Firewall: NPM already needs 80/443 open; keep them as-is.
# Do NOT open 9930 or 9931 to the public — they're only for NPM to reach internally.
sudo ufw status
# If 80/443 already in the rules: good. No changes needed.

# DNS: accounting.cnppai.com → server public IP. You said it already points correctly.
dig +short accounting.cnppai.com
curl -s ifconfig.me; echo    # must match
```

Find the host LAN IP — NPM uses it to reach our services:

```bash
hostname -I | awk '{print $1}'
# Example output: 192.168.1.50
# Remember this — call it $HOST_IP for the NPM config in step 6.
```

---

## 1. Server prep

```bash
sudo mkdir -p /DATA/AppData/www/mini_acc
sudo chown -R $USER:$USER /DATA/AppData/www/mini_acc
cd /DATA/AppData/www/mini_acc
```

> Compose project name is derived from the directory (`mini_acc`), so volumes are prefixed `mini_acc_*` (e.g. `mini_acc_db_data`). Don't rename the directory after first deploy or the volumes will look orphaned.

### Attachment storage (uploads — expense receipts + AI inbox)

`./attachments` is a bind mount into the api container at `/var/lib/hj-account/attachments`. Create it once with the right owner before first `up -d`:

```bash
mkdir -p ./attachments
sudo chown -R 1001:0 ./attachments    # api container runs as uid 1001
```

If you skip this and the api starts first, Docker creates the directory as `root:root` and uploads fail with `EACCES: permission denied`. Fix after the fact with the same `chown` command.

---

## 2. Clone the repo

```bash
cd /DATA/AppData/www/mini_acc
git clone <YOUR_REPO_URL> .            # note the trailing dot
git checkout master
```

---

## 3. Secrets + `.env.production`

```bash
cp .env.production.example .env.production
./scripts/generate-secrets.sh          # prints JWT_SECRET / DB_PASSWORD / DB_ROOT_PASSWORD
```

Paste those into `.env.production`, then verify:

```
WEB_ORIGIN=https://accounting.cnppai.com
NEXT_PUBLIC_API_URL=                   # leave EMPTY (NPM same-origin proxy)
OPENROUTER_API_KEY=sk-or-...           # optional; mock-only if empty
AI_INBOX_DISABLED=0                    # set to 1 if you don't want PDF text egressing
```

> `.env.production` contains real secrets — never commit it.
> ```bash
> git check-ignore .env.production && echo OK || echo "WARN: not ignored"
> ```

---

## 4. Build + start

```bash
cd /DATA/AppData/www/mini_acc

# Build images on the server (5–10 min first time)
docker compose -f docker-compose.prod.yml --env-file .env.production build

# Start everything
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Watch services come healthy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=50
# Ctrl-C to detach when api logs "Nest application successfully started"
```

---

## 5. Prisma migrate + seed

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
    sh -c "pnpm prisma migrate deploy && pnpm prisma db seed"
```

The seed creates the Solutions Nextgen company + 6 numbering rules + two users:
- `owner@solutionsnextgen.co.th` / `owner123!` (OWNER)
- `admin@solutionsnextgen.co.th` / `admin123!` (ADMIN)

**Immediately after first login, change the owner password** at `/settings/users`. The seed credentials are in source code — assume compromised the moment the repo leaves your laptop.

---

## 5b. Smoke test on the host (before NPM)

Confirm the containers serve traffic on their host ports before fronting them with NPM:

```bash
# Web (Next.js login page)
curl -sI http://localhost:9930/login | head -5
# → HTTP/1.1 200 OK

# Api (any endpoint — login is the obvious one)
curl -sI http://localhost:9931/api/auth/login -X POST | head -5
# → 400 or 401 = service responding; the goal is just to prove it answers
```

If both respond, you're ready to wire up NPM.

---

## 6. Configure Nginx Proxy Manager

Open the NPM dashboard at `http://<server-ip>:81` (default NPM admin port).

### 6a. Add Proxy Host

**Hosts → Proxy Hosts → Add Proxy Host**

| Tab | Field | Value |
|---|---|---|
| Details | Domain Names | `accounting.cnppai.com` |
| Details | Scheme | `http` |
| Details | Forward Hostname/IP | `<HOST_IP>` (from step 0, e.g. `192.168.1.50`) |
| Details | Forward Port | `9930` |
| Details | Cache Assets | ✓ |
| Details | Block Common Exploits | ✓ |
| Details | Websockets Support | ✓ |

> **Why host LAN IP instead of `host.docker.internal` or a container name?** NPM lives in its own docker network; it cannot reach `mini_acc`'s network by container DNS. The host's LAN IP works because NPM containers reach the host through the docker bridge gateway, and `9930` is published on the host.

### 6b. Custom location for `/api/`

Still inside the same Proxy Host, **Custom locations** tab:

| Field | Value |
|---|---|
| Define location | `/api/` |
| Scheme | `http` |
| Forward Hostname/IP | `<HOST_IP>` |
| Forward Port | `9931` |

Click the gear icon next to the location → add this to **Custom Nginx Configuration** (so file uploads up to 25 MB don't get cut off and large PDF generates don't time out):

```
client_max_body_size 25M;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

### 6c. SSL — request a Let's Encrypt cert

**SSL** tab on the Proxy Host:

| Field | Value |
|---|---|
| SSL Certificate | Request a new SSL Certificate |
| Force SSL | ✓ |
| HTTP/2 Support | ✓ |
| HSTS Enabled | **leave OFF for now** — turn on after 24h+ of stable HTTPS |
| Email Address for Let's Encrypt | `sooksun2511@gmail.com` |
| I Agree to the Let's Encrypt ToS | ✓ |

Click **Save**. NPM will:
1. Solve the HTTP-01 challenge automatically (it already serves port 80).
2. Request the cert.
3. Reload its own nginx with TLS enabled.

Renewal is automatic — NPM runs `certbot renew` on a built-in schedule. No host cron needed.

---

## 7. Verify

```bash
# From your laptop
curl -sI https://accounting.cnppai.com/login | head -5
# → HTTP/2 200

curl -sI https://accounting.cnppai.com/api/auth/login -X POST | head -5
# → 400 / 401 — proves /api/ routing works through NPM
```

Open `https://accounting.cnppai.com` in a browser → login as owner → change password → done.

> **Stop here** until HTTPS works end-to-end. After 24h+ of stable HTTPS you can flip on **HSTS Enabled** in NPM's SSL tab.

---

## 8. Verify backups

The `backup` service runs daily at 02:00 Asia/Bangkok and writes to `./backup/YYYY-MM-DD_HHMM.sql.gz` (14-day retention).

Trigger one manually to confirm wiring:

```bash
cd /DATA/AppData/www/mini_acc
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh
ls -la backup/
```

Restore drill (do this once on a staging copy before you trust the backup):

```bash
docker compose -f docker-compose.prod.yml exec -T db sh -c \
    'gunzip < /backup/2026-05-16_0200.sql.gz | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" hjacc'
```

---

## 9. Update procedure (new commits)

```bash
cd /DATA/AppData/www/mini_acc

# 1. Backup BEFORE any change touches data
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh

# 2. Pull
git fetch origin && git pull --ff-only

# 3. Rebuild what changed (api + web only; db/redis use pre-built images)
docker compose -f docker-compose.prod.yml --env-file .env.production build api web

# 4. Apply new migrations BEFORE swapping the api container
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
    pnpm prisma migrate deploy

# 5. Rolling restart — api first, then web. NPM keeps routing.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps api
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps web

# 6. Health check
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 api web

# 7. Verify externally
curl -sI https://accounting.cnppai.com/login | head -5
```

No NPM reload needed — NPM's upstream stays the same (host:9930/9931), only the backing container changes.

---

## 10. Rollback

**Code only (no schema change):**

```bash
cd /DATA/AppData/www/mini_acc
git checkout <previous-commit-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production build api web
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps api web
```

**Code + schema:**

> Prisma `migrate deploy` is one-way. To revert a schema change:

```bash
# Restore DB from the backup you took in step 9.1
docker compose -f docker-compose.prod.yml exec -T db sh -c \
    'gunzip < /backup/<TIMESTAMP>.sql.gz | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" hjacc'

# Then check out the previous code
git checkout <previous-commit-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production build api web
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps api web
```

---

## 11. Operations cheatsheet

```bash
cd /DATA/AppData/www/mini_acc

# Status
docker compose -f docker-compose.prod.yml ps

# Tail logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 api web

# Restart one service
docker compose -f docker-compose.prod.yml restart api

# Stop the stack (data volumes survive)
docker compose -f docker-compose.prod.yml down

# Stop + WIPE volumes — IRREVERSIBLE, do not run on prod
# docker compose -f docker-compose.prod.yml down -v

# Open an api shell (Prisma Studio, ad-hoc queries)
docker compose -f docker-compose.prod.yml exec api sh

# Disk usage of this stack's volumes
docker system df -v | grep mini_acc_
```

---

## 12. Troubleshooting

**NPM "Bad Gateway" after step 6**
- Wrong `HOST_IP` in the Proxy Host: `hostname -I` and confirm the first IP matches.
- 9930/9931 not actually listening: `ss -tlnp | grep -E '9930|9931'` on the host should show both. If not, `docker compose ps` and check `web`/`api` are running.
- NPM container can't reach the host: rare on Linux. As a test, `docker exec -it nginxproxymanager curl -sI http://<HOST_IP>:9930/login` from inside NPM. If it fails, NPM may need an `extra_hosts: ["host.docker.internal:host-gateway"]` entry — use `host.docker.internal` instead of `<HOST_IP>` in the Proxy Host config.

**Browser shows "ERR_SSL_PROTOCOL_ERROR"**
- NPM's cert request failed. Check NPM's SSL tab for the error message. Most common: DNS A record not actually pointing at this server (`dig +short accounting.cnppai.com` vs `curl -s ifconfig.me`).

**Login returns 429 "Too Many Requests"**
- Comes from NestJS rate limit on `/api/auth/login`, not NPM. Wait a minute. If you need to widen it for debug, edit `apps/api/src/auth/auth.controller.ts` and rebuild.

**`migrate deploy` says "P3009 — failed migrations found"**
- A prior migration is in a failed state. `pnpm prisma migrate resolve --rolled-back <migration-name>`, then re-run.

**File upload fails with 413 Request Entity Too Large**
- You forgot the `client_max_body_size 25M;` in NPM's Custom Nginx Configuration (step 6b). Add it, save, and NPM will reload its nginx automatically.

**Backup files growing too large**
- Default retention is 14 days (`scripts/backup.sh:13`). Edit `RETAIN_DAYS` if you need a different window.
- Verify rotation actually runs: `find ./backup -name "*.sql.gz" -mtime +14` should print nothing.

---

## 13. Security checklist before going live

- [ ] `.env.production` is gitignored (`git check-ignore .env.production`).
- [ ] Seeded owner password (`owner123!`) is changed via `/settings/users`.
- [ ] `JWT_SECRET` is the 48-byte random output, not the placeholder.
- [ ] `DB_ROOT_PASSWORD` and `DB_PASSWORD` are distinct and not placeholders.
- [ ] Host firewall: only ports 22/80/443 are open externally. **9930/9931 must NOT be public.**
- [ ] SSH: key-based auth only, password auth disabled.
- [ ] `AI_INBOX_DISABLED=1` set if you don't want PDF receipt text egressing to OpenRouter/Anthropic; otherwise tell the operator it's happening (US-hosted LLM).
- [ ] DNS A record resolves correctly; no leftover dev/staging IP.
- [ ] HTTPS works (`curl -sI https://accounting.cnppai.com/login` → 200).
- [ ] **HSTS Enabled** in NPM only after 24h+ of stable HTTPS (hard to undo).
- [ ] Backup directory `./backup/` is on a disk with enough headroom (rule of thumb: 2× DB size × 14 days).
- [ ] Restore drill (step 8) has been done at least once.
- [ ] Off-host backup: this runbook does NOT copy backups off the server. Add rclone/rsync to S3/B2/another box. Losing the host means losing backups too.
