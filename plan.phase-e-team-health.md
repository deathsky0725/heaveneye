# 🩺 Heaveneye — Phase E: Team Health & Observability

> **เจตนา:** ทำให้ "สุขภาพทีม" มองเห็นได้. Session 2026-06-10/11 บินบอด 3 เรื่อง: (1) MiniMax-M3 ชน 5h quota แบบไม่รู้ตัว → C3 crash, (2) shihao ติดลูป 2.5h กว่าจะรู้, (3) worker self-complete โดยไม่มี handoff. Phase E = surface พวกนี้บน dashboard.
> **ฐาน:** main = 1c80870 (B1+C+D merged). bundle 390.45 kB.
> **Roadmap:** `ROADMAP.md` Phase E.

## 🎯 หลักการ Phase E — SMALL PR / AGILE
- **1 task = 1 small PR = 1 focused change** (XS/S เท่านั้น — ถ้ารู้สึกว่าใหญ่ ให้แตกอีก)
- ทีมทำเสร็จไว + ji-ziyue/yanxin ตรวจเร็ว (diff เล็ก review ไม่นาน)
- แต่ละ task independently-shippable (ไม่ต้องรอ task อื่นถ้าไม่ระบุ dependency)
- ลำดับ: BE ที่ provide data ก่อน → FE ที่ consume ตามหลัง (ระบุ dependency ชัด)

## กฎรวม Phase E
- ห้าม npm dep ใหม่ · **bundle ≤ 400 kB** (เผื่อ panel ใหม่ จาก 390.45) · prefers-reduced-motion ทุก animation
- ห้ามรื้อ B1/C/D · ไม่ทับ liveness เดิม
- **STEP 0 investigate ก่อนเขียน** สำหรับ task ที่ data availability ไม่ชัด (บทเรียน C3/D1/D3) — data ไม่พอ → BLOCK + report ji-ziyue (อย่าเดา/over-build)
- verify: `bunx tsc --noEmit` 0 + `bun run build` pass + bundle ≤ 400 + handoff comment ครบ
- ทุก task → **yanxin QA (vision)** → ji-ziyue audit ก่อน merge
- test infra ที่มี: `/api/test/status` (force status/idleMinutes) + `/api/test/milestone` — ใช้ verify ได้

## 📊 Data sources ที่มีอยู่ (worker อ่านก่อนเริ่ม)
- `AgentSnapshot`: status · currentTask · currentModel · tokensToday · lastEventAt · lastTool · blockReason (`web/src/types.ts`)
- `/api/agents` · `/api/usage` · StatChart · CostPanel · SystemHealth (gateway pid/cpu/ram จาก `watchers/system-health.ts`)
- kanban runs/events (`watchers/kanban.ts` + kanban DB): crashed · timed_out · consecutive_crashes · iteration-exhausted · blocked · completed
- review_watcher daemon: detect self-complete-without-handoff (มี signal อยู่แล้ว)

---

## Tasks (เรียงตาม dependency — แต่ละตัว small PR)

### กลุ่ม A — Provider rollup & quota awareness

**E1 · provider derive helper (yefan, XS)**
- เพิ่ม fn `modelToProvider(model: string): string` (เช่น 'MiniMax-M3'→'minimax', 'Claude…'→'anthropic', 'gemini…'→'gemini') + unit-ish ใช้ที่เดียว
- expose `provider` ใน AgentSnapshot (compute จาก currentModel) — `server/state/engine.ts` + `web/src/types.ts`
- Acceptance: /api/agents แต่ละ agent มี `provider` ถูก · tsc/build

**E2 · /api/providers endpoint (yefan, S)** · dep: E1
- aggregate per provider: { provider, agents: id[], tokensToday รวม } จาก agent snapshots
- `server/index.ts` route + engine getter
- Acceptance: curl /api/providers คืน array ต่อ provider ถูก · tsc/build

**E3 · ProviderPanel component (shihao, S)** · dep: E2
- panel เล็ก: list provider + token รวม + agent chips ที่ใช้ provider นั้น (อ่าน /api/providers)
- วางใน dashboard (จุดที่เหมาะ ไม่ดัน layout เพี้ยน) · reduced-motion safe
- Acceptance: เห็น provider + tokens + agents · visual ok · bundle ≤ 400

**E4 · rate-limit (429/503) counter (yefan, S)** ⚠️ STEP 0
- STEP 0: 429/503 จาก provider โผล่ที่ไหนที่ dashboard เห็น? (gateway log? kanban event error? status.jsonl?) — ตรวจก่อน
  - (A) มี signal → นับ rate-limit hits ต่อ provider (rolling window) + expose ใน /api/providers
  - (B) ไม่มี (dashboard ไม่เห็น gateway LLM error stream) → BLOCK + report ji-ziyue (อาจต้อง parse log แยก = Phase แยก)
- Acceptance: verdict A/B + หลักฐาน; ถ้า A → count ถูก

**E5 · rate-limit warning badge (shihao, XS)** · dep: E4=A
- ProviderPanel: ถ้า rate-limit recent → badge เตือน (amber) ต่อ provider
- Acceptance: 429/503 recent → badge ขึ้น · reduced-motion safe

### กลุ่ม B — Stuck-worker / reliability detection

**E6 · stuck-worker detector (yefan, S)** ⚠️ STEP 0
- STEP 0: kanban run data (elapsed time, consecutive_crashes, iteration-exhausted) เข้าถึงได้จาก engine/watcher ไหม? (เราเห็นใน `kanban runs`/diagnostics) — ตรวจก่อน
  - (A) เข้าถึงได้ → detect "stuck": run elapsed > THRESHOLD (เช่น 20min) หรือ consecutive_crashes ≥ 2 → set `healthFlag?: 'stuck'|'crash-loop'` ใน AgentSnapshot
  - (B) ไม่พอ → BLOCK + report
- Acceptance: verdict + ถ้า A → healthFlag set ถูกตอน stuck · ไม่ false-positive ตอนปกติ

**E7 · self-complete-without-handoff flag (yefan, XS)** · dep: E6 (ใช้ healthFlag field เดียวกัน)
- review_watcher detect signal นี้อยู่แล้ว → map เป็น `healthFlag: 'silent-done'` บน agent
- Acceptance: silent-done → flag · tsc/build

**E8 · health flag visual on agent (shihao, S)** · dep: E6
- agent ที่มี healthFlag → warning ring/icon (เช่น ⚠️ ส้ม) + tooltip บอกเหตุ — บน OfficeMap
- ไม่ทับ status border เดิม (compose) · reduced-motion safe
- Acceptance: healthFlag → เห็น warning ชัด · ปกติ→ไม่มี · force ทดสอบได้

**E9 · Team Health summary strip (shihao, S)** · dep: E6
- strip เล็กบนหัว dashboard: นับ {healthy / stuck / crash-loop / rate-limited} + สีรวม (เขียว/เหลือง/แดง)
- อ่านจาก agent snapshots (healthFlag + provider rate-limit)
- Acceptance: นับถูก · สีสะท้อนสถานะแย่สุด · visual ok

### กลุ่ม C — Reliability history (optional, ถ้าเหลือเวลา)

**E10 · per-agent reliability mini-stats (shihao, S)** · dep: E6
- ใน DetailPanel: crash/timeout count วันนี้ ต่อ agent (จาก kanban runs)
- Acceptance: count ถูก · ไม่กระทบ DetailPanel เดิม

---

## Execution protocol
- Dispatch ทีละ task เล็ก ตาม dependency (A: E1→E2→E3, E4→E5 · B: E6→E7/E8/E9 · C: E10)
- E1/E3/E6/E8 = ทำขนานได้บางส่วน (E1+E6 backend ขนานกัน, FE ตามหลัง)
- STEP 0 (E4, E6): data ไม่พอ → block+report ji-ziyue ก่อนเขียน
- flow ทุก task: dev → **yanxin QA (vision)** → ji-ziyue audit → commit (small PR)
- ปิด Phase E → ji-ziyue FINAL AUDIT (build + ดู panel รวม "ดูดีพอ") → merge main
- branch: `feat/phase-e-team-health`
