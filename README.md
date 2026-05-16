# HJ Account AI

ระบบบัญชี SMB ไทย — `NestJS + Next.js 15 + Prisma + MariaDB` พร้อม AI ช่วยอ่านเอกสาร, รายงาน VAT/WHT, ปิดงวดบัญชี, และ Accountant Pack export

> **MVP scope (v0.1)** — รองรับครบ 18 modules ตาม PRD §14: ลูกค้า/ผู้ขาย, สินค้า, คลัง, ทรัพย์สินถาวร, เอกสารขายครบ 6 ประเภท (QT/INV/DN/RC/TAX/RT), AI Inbox, ใบเสร็จรายจ่าย, การจ่ายเงิน, Bank Reconciliation, ภาษี VAT/WHT, หนังสือรับรอง 50 ทวิ + ใบแนบ ภ.ง.ด.3/53, Risk Center, ปิดงวดบัญชี, Accountant Pack.

---

## Quick start (development — Windows + Laragon)

ต้องการ: Node 20.11+, pnpm 9.12+, Laragon (MySQL 8 + Redis ผ่าน Quick add)

```powershell
pnpm install
copy .env.example .env
# แก้ JWT_SECRET ใน .env ก่อนรันครั้งแรก:
#   openssl rand -base64 48  (หรือสุ่มเอง)

# Apply migrations + seed (สร้างบริษัท + 2 users + เลขเอกสาร 6 ประเภท)
pnpm db:migrate

# Run both apps in parallel (api :4000, web :3000)
pnpm dev
```

เปิด <http://localhost:3000> → login ด้วย:

- `owner@solutionsnextgen.co.th / owner123!` (OWNER)
- `admin@solutionsnextgen.co.th / admin123!` (ADMIN)

---

## Quick start (production — single-host Docker)

ต้องการ: เครื่อง Linux ติดตั้ง `docker` + `docker compose` (ทดสอบบน Ubuntu 22.04 LTS), RAM ≥ 4GB, disk ≥ 20GB

```bash
# 1) ดึงโค้ดลงเครื่อง production
git clone <your-repo-url> hj-account-ai
cd hj-account-ai

# 2) สร้าง secrets แล้ว copy ลง .env.production
cp .env.production.example .env.production
sh scripts/generate-secrets.sh >> .env.production   # JWT_SECRET + DB passwords
$EDITOR .env.production                              # ตั้ง WEB_ORIGIN + (optional) OPENROUTER_API_KEY

# 3) Build + start stack ทั้งหมด
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4) Migrate + seed (รันครั้งแรกเท่านั้น)
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
    node -e "require('child_process').execSync('npx prisma migrate deploy && npx prisma db seed', {stdio:'inherit', env: process.env})"

# 5) เช็คสุขภาพ
curl http://localhost/api/health
# → {"status":"UP","db":"reachable","timestamp":"..."}
```

หลังขึ้นแล้ว เปิด `http://<server-ip>/` (หรือ domain ของคุณ) → login ด้วยบัญชี seed

### ติดตั้ง TLS (HTTPS)

1. ขอ cert จาก Let's Encrypt (certbot) หรือใช้ Cloudflare Origin Certificate
2. วาง `fullchain.pem` + `privkey.pem` ลงใน `./nginx/certs/`
3. แก้ `./nginx/conf.d/hj-account.conf`:
   - uncomment block `server { listen 443 ssl ... }`
   - uncomment บรรทัด `return 301 https://...` ใน block port 80
4. รีโหลด nginx: `docker compose -f docker-compose.prod.yml restart nginx`

### Backup + Restore

Backup รันอัตโนมัติทุกวัน 02:00 (Asia/Bangkok) — เก็บไฟล์ 14 วันใน `./backup/YYYY-MM-DD_HHMM.sql.gz`

Restore manual:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
    sh -c 'gunzip < /backup/2026-05-16_0200.sql.gz | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" hjacc'
```

แนะนำให้ rsync `./backup/` ไป off-site อย่างน้อยสัปดาห์ละครั้ง

### Update production

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api web
# ถ้ามี migration ใหม่:
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
    node -e "require('child_process').execSync('npx prisma migrate deploy', {stdio:'inherit'})"
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    nginx (80/443)                         │
│       reverse proxy, rate limit, TLS termination          │
└──────────────┬──────────────────────────┬─────────────────┘
               │ /api/*                   │ /
               ▼                          ▼
       ┌───────────────┐         ┌───────────────────┐
       │  api :4000    │         │   web :3000        │
       │  NestJS 10    │         │   Next.js 15       │
       │  + BullMQ     │         │   (standalone)     │
       │  + Playwright │         └────────────────────┘
       └───────┬───────┘
               │
        ┌──────┴──────┐
        ▼             ▼
  ┌─────────┐   ┌──────────┐
  │ db:3306 │   │redis:6379│
  │MariaDB11│   │ Redis 7  │
  └─────────┘   └──────────┘
        ▲
        │ daily mariadb-dump → /backup
        │
  ┌─────┴────┐
  │  backup  │ cron 02:00 Asia/Bangkok
  └──────────┘
```

- **Same-origin proxy**: nginx forwards `/api/*` → api:4000 และ `/*` อื่น ๆ → web:3000 — bundle ที่เบราว์เซอร์ใช้ relative path เลยไม่ต้องเปิด CORS
- **เน็ตเวิร์กภายใน**: db, redis, api, web ต่อเฉพาะ `hj-net` (bridge) — ไม่ expose ออก host. มีแค่ nginx ที่ bind 80/443
- **Volumes**: `db_data` (MariaDB), `redis_data` (Redis AOF), `attachments` (ไฟล์แนบ), `nginx_cache`

## Sources of truth

- **PRD-HJ-Account-AI-v2.md** — เอกสารกำหนดขอบเขต/business rules/data model/API/acceptance criteria (30 sections, Thai)
- **CLAUDE.md** — guideline สำหรับ AI assistant + decisions ที่ผู้ใช้ confirm แล้ว
- **Invoice-PP-003-2569.pdf** — visual reference สำหรับเอกสารขาย 3 หน้าหลัก
- **prisma/schema.prisma** — แหล่ง truth ของ schema (ทุก field/enum/relation)

## License

Proprietary — © 2026 หจก. โซลูชั่น เนกซ์เจน (Solutions Nextgen LP) — built for in-house use
