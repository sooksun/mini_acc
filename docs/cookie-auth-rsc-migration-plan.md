# Plan: Cookie-auth → React Server Components migration

> สถานะ: **แผน (ยังไม่เริ่มทำ)** — เขียนจาก performance audit (2026-06-13). Finding E.
> เป้าหมาย: ปลดล็อกให้หน้า list/detail เป็น **Server Components** ได้ เพื่อลด JS ที่ส่งให้ client และตัด useEffect-waterfall
> ไม่ใช่งานเร่งด่วน — ทำเป็นโปรเจกต์แยกตอนแตะ auth ครั้งถัดไป

---

## 1. ทำไมต้องทำ (payoff)

ตอนนี้ทั้ง `(app)` tree เป็น client-render หมด เพราะ auth gate อ่าน token จาก `localStorage`
(`apps/web/src/app/(app)/layout.tsx` เป็น `'use client'` + `if (!ready) return null`).

ผลกระทบที่วัดได้จาก `next build`:

| หน้า | First Load JS |
|---|---|
| sales/* (form/detail) | **245–254 kB** |
| ai-inbox / projects / settings/company/vat | 235–242 kB |
| shared baseline | 99.8 kB |

ทุกหน้าแบก antd + react-toastify + fetch-in-`useEffect` ทั้งที่หน้า list/detail จำนวนมากเป็น **read-only display**
ที่ควร fetch บน server แล้ว stream HTML ลงมา — ไม่ต้องส่ง antd ไปทั้งก้อน และไม่ต้องรอ hydrate ก่อนถึงจะยิง API.

**RSC ทำไม่ได้ตอนนี้** เพราะ Server Components อ่าน `localStorage` ไม่ได้ — server ไม่รู้ว่าใคร login.
ทางปลดล็อกคือย้าย JWT จาก `localStorage` → **httpOnly cookie** ให้ server อ่าน credential จาก request ได้.

---

## 2. สถานะปัจจุบัน (ไฟล์จริงที่ต้องแตะ)

| จุด | ไฟล์ | ทำอะไรอยู่ |
|---|---|---|
| เก็บ token | `apps/web/src/lib/auth.ts` | `localStorage['hj-token']` + `['hj-user']` |
| แนบ token | `apps/web/src/lib/api.ts:16-17` | `getToken()` → `Authorization: Bearer`. **มี `credentials: 'include'` อยู่แล้ว** (cookie จะไหลทันทีถ้า backend set) |
| auth gate | `apps/web/src/app/(app)/layout.tsx:17-27` | `'use client'`, useEffect เช็ค `getToken()`, `return null` จนกว่าจะ ready |
| รับ token | `apps/api/src/auth/jwt.strategy.ts:15-19` | `ExtractJwt.fromAuthHeaderAsBearerToken()` — **header เท่านั้น** |
| login | `apps/api/src/auth/auth.controller.ts:13-18` | คืน `{ accessToken, user }` ใน body, ไม่ set cookie |
| logout | `apps/api/src/auth/auth.controller.ts:20-26` | no-op |
| CORS | `apps/api/src/main.ts` | helmet + CORS จำกัด `WEB_ORIGIN` |

**ข้อได้เปรียบ:** prod เป็น **same-origin** (NPM proxy: `/` → web :9930, `/api/` → api :9931) → httpOnly cookie ที่ออกโดย `/api` ใช้กับหน้าเว็บได้ตรง ๆ ไม่มีปัญหา cross-site. ความซับซ้อนอยู่ที่ dev (web :3000 ≠ api :4000 = cross-origin) เท่านั้น.

---

## 3. สถาปัตยกรรมเป้าหมาย

- Login → backend `Set-Cookie: hj-token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/`
- ทุก request (RSC fetch บน server + client fetch) แนบ cookie อัตโนมัติ — ไม่ต้องอ่าน `localStorage`
- `JwtStrategy` ดึง token จาก **cookie ก่อน, fallback Authorization header** (เพื่อ migrate แบบไม่พัง)
- auth gate ย้ายไป `middleware.ts` (อ่าน cookie ฝั่ง server) — ไม่ต้อง `return null` blank shell
- หน้า read-heavy (sales list, audit log, reports, customers/vendors/products list) → `async` Server Component, fetch บน server ด้วย cookie, ไม่มี antd ใน bundle, ไม่มี useEffect waterfall

---

## 4. ข้อควรระวัง (อ่านก่อนเริ่ม)

1. **CSRF** — httpOnly cookie ส่งอัตโนมัติทุก request → เปิดช่อง CSRF กับ mutation (POST/PATCH).
   มาตรการ: `SameSite=Lax` กันได้เกือบหมด (block cross-site POST). ถ้าต้องการแน่นกว่านี้ ใช้ double-submit CSRF token. **อย่าข้ามข้อนี้** — ปัจจุบัน Bearer-in-header ภูมิคุ้มกัน CSRF อยู่แล้ว, การย้ายไป cookie ต้องชดเชย.
2. **Dev cross-origin** — web :3000 ↔ api :4000. ทางเลือก:
   - (แนะนำ) ตั้ง Next rewrites ให้ `/api/*` proxy ไป `:4000` ใน `next.config.mjs` (dev) → กลายเป็น same-origin เหมือน prod, cookie `SameSite=Lax` ใช้ได้เลย; **ลบ `NEXT_PUBLIC_API_URL` ออกจาก path** (ใช้ relative `/api`)
   - หรือ `SameSite=None; Secure` + CORS `credentials: true` + origin allowlist (ยุ่งกว่า, ต้อง https ใน dev)
3. **การ deactivate user ต้องยังทำงานทันที** — `jwt.strategy.validate()` เช็ค `isActive` ทุก request อยู่แล้ว (`jwt.strategy.ts:26`); ห้ามแคชส่วนนี้ (audit เคยยืนยันว่า lookup นี้ **ต้องคงไว้** — เป็น security ไม่ใช่ perf bug)
4. **`getUser()` ใน client components** — ตอนนี้หลายหน้าอ่าน role จาก `localStorage['hj-user']` (เช่น sidebar, role-check). ถ้าเอา user ออกจาก localStorage ต้องมีทางให้ client รู้ role: เก็บ user (ไม่ลับ) ใน cookie ธรรมดา (อ่านได้) หรือส่งผ่าน props จาก server layout
5. **logout** ต้อง clear cookie จริง (`auth.controller.ts` logout ปัจจุบัน no-op) — เปลี่ยนเป็น `res.clearCookie('hj-token')`

---

## 5. ขั้นตอน (แต่ละเฟส ship ได้เอง, ไม่พังของเดิม)

### Phase 1 — ออก + รับ cookie (dual-mode, ไม่แตะ frontend behavior)
ทำให้ระบบ "รับได้ทั้ง cookie และ Bearer" ก่อน เพื่อ migrate แบบ zero-downtime.
- `auth.controller.ts login()` — หลังได้ `LoginResponse` ให้ `@Res({ passthrough: true })` แล้ว `res.cookie('hj-token', accessToken, { httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', path: '/', maxAge: <= JWT_EXPIRES_IN })`. ยังคืน body เดิม (`accessToken`) ไว้ → ของเดิมที่อ่าน localStorage ยังทำงาน
- `auth.controller.ts logout()` — `res.clearCookie('hj-token')`
- `jwt.strategy.ts` — เปลี่ยน `jwtFromRequest` เป็น `ExtractJwt.fromExtractors([ (req) => req.cookies?.['hj-token'], ExtractJwt.fromAuthHeaderAsBearerToken() ])`
- ติดตั้ง `cookie-parser` ใน `main.ts` (`app.use(cookieParser())`) + `@types/cookie-parser`
- CORS: ตรวจว่า `credentials: true` ใน `main.ts` (api.ts ใช้ `credentials:'include'` อยู่แล้ว ฝั่ง browser)
- **เพิ่ม CSRF guard สำหรับ mutation** (SameSite=Lax + ออริจิน check) — ทำในเฟสนี้เลย
- ✅ จุดตรวจ: login แล้ว response มี `Set-Cookie`; เรียก `/api/auth/me` ด้วย cookie อย่างเดียว (ไม่มี Bearer) ต้องผ่าน

### Phase 2 — ย้าย auth gate ไป server
- เพิ่ม `apps/web/src/middleware.ts` — อ่าน cookie `hj-token`; ถ้าไม่มี → `NextResponse.redirect('/login')` สำหรับ matcher `(app)` routes. (middleware ไม่ verify ลายเซ็น แค่เช็คว่ามี token; การ verify จริงอยู่ที่ api ทุก request)
- dev: เพิ่ม rewrites `/api/* → http://localhost:4000/api/*` ใน `next.config.mjs` (ทำให้ same-origin) และเปลี่ยน `api.ts` BASE เป็น relative `/api` เสมอ
- `(app)/layout.tsx` — ลบ logic `getToken()/return null`; เก็บแค่ ConfigProvider + sidebar (ยังเป็น client เพราะ antd, แต่ไม่ block ด้วย auth แล้ว). ส่ง `user` ให้ sidebar จาก server (อ่าน `/me` ใน server layout)
- เอา user ออกจาก localStorage → ให้ client อ่าน role จาก cookie ธรรมดา (`hj-user`, ไม่ httpOnly) หรือ props
- ✅ จุดตรวจ: ไม่มี blank shell ตอน cold load; redirect ทำงานก่อน render

### Phase 3 — migrate หน้า read-heavy เป็น RSC (ทำทีละหน้า)
ไล่จากหน้าที่ได้ประโยชน์สุด:
1. `settings/audit-log` (เพิ่งทำ pagination — เป็น read-only ล้วน, เหมาะสุด)
2. sales list (`sales/*/page.tsx` → server fetch, ส่ง rows ให้ client component เฉพาะส่วน interactive)
3. customers / vendors / products list
4. reports / profit-loss
- รูปแบบ: route page เป็น `async function Page()` ที่ `await fetchOnServer()` (helper ใหม่ที่อ่าน cookie ผ่าน `next/headers` `cookies()`), render ตารางเป็น HTML; ส่วนปุ่ม/modal/filter ที่ต้อง interactive แยกเป็น client component เล็ก ๆ
- สร้าง `apps/web/src/lib/server-api.ts` — fetch wrapper ฝั่ง server ที่อ่าน cookie จาก `next/headers`
- ✅ จุดตรวจ: หน้าเหล่านี้ First Load JS ลดลง (ไม่มี antd), ไม่มี loading spinner รอ fetch

### Phase 4 — cleanup
- ลบ token ออกจาก `localStorage` ทั้งหมด; `auth.ts` เหลือแค่ helper อ่าน user (จาก cookie/props)
- ลบ Bearer path ใน `api.ts` (cookie ไหลเองผ่าน same-origin)
- ลบ `accessToken` ออกจาก `LoginResponse` body (เหลือ cookie อย่างเดียว) — หรือคงไว้เผื่อ mobile client อนาคต
- ✅ จุดตรวจ: `grep localStorage` ใน apps/web เหลือเฉพาะ theme; ปิด tab แล้วเปิดใหม่ยัง login อยู่ (cookie persist)

---

## 6. ของแถมราคาถูก (ทำได้เลย ไม่ต้องแตะ auth)

หน้า role-check บาง ๆ ที่เป็น `'use client'` แค่เพื่ออ่าน `getUser()` (เช่น `sales/quotations/page.tsx`)
→ ดัน role check ลงไปใน list component ที่เป็น client อยู่แล้ว (เช่น `SalesDocumentsList`)
ให้ route page กลับเป็น server component ได้ทันที โดยไม่ต้องรอ cookie-auth.
ทำตอนแก้ route เหล่านั้นครั้งถัดไป (near-free).

---

## 7. effort & ลำดับ

- Phase 1: **M** (~half day) — backend cookie + CSRF + dual-mode strategy
- Phase 2: **M** — middleware + dev rewrites + server layout
- Phase 3: **L** — ทยอย migrate ทีละหน้า (วัดผลทีละหน้า)
- Phase 4: **S** — cleanup

**อย่าทำ Phase 3 ก่อน Phase 1–2 เสร็จ.** อย่าทำ blanket RSC migration ทั้งหมดรวดเดียว — migrate ทีละหน้าแล้ววัด First Load JS เทียบ.
จุดคุ้มสุดต่อแรง: Phase 1–2 (ปลดล็อก) + audit-log/sales list เป็น 2–3 หน้าแรกใน Phase 3.
