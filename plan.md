# 👁️ Heaveneye — Plan

> **Pivot 2026-05-23:** กลับมา view-only monitoring dashboard. Chat/spawn UI ถูกถอดออกหลังเจอข้อจำกัด CLI tools (claude/agy/hermes) ที่ไม่เหมาะกับ web orchestration. ดู `result.md` สำหรับสิ่งที่ ship แล้ว และ `PROGRESS.md` สำหรับสถานะปัจจุบัน

---

## 1. เจตนา (post-pivot)

**Heaveneye = view-only dashboard** สำหรับมอนิเตอร์ Hermes agents (ziyue + anmaioyi + 5 specialists). พี่เบญใช้ดูว่าใครทำอะไรอยู่, RAM พอไหม, มี block ค้างมั้ย, token usage วันนี้เท่าไหร่.

**สั่งงาน agent จริง:**
- คุยกับ Ji-Ziyue (เลขา) → Claude Code CLI โดยตรง
- สั่ง Hermes Lead/specialists → `hermes kanban create` / Discord channel
- ใช้ Antigravity → `agy` CLI ใน terminal

Heaveneye **ไม่พยายามเป็น chat platform** เพราะ CLI tools เหล่านี้ออกแบบมาเพื่อ terminal use ไม่ใช่ web orchestration

---

## 2. Stack ปัจจุบัน

| Layer | Tech |
|-------|------|
| Backend | Bun + Hono :7878 (REST + SSE) |
| Frontend | React 19 + Zustand + Tailwind 4 + Rive |
| Watchers | chokidar (status.jsonl, kanban DB, inbox.jsonl, system health) |
| Native wrap | Tauri 2.0 (tray + hotkey) |
| Daemons | protocol_guard.py + review_watcher.py (launchd 24/7) |
| HM2-REPORT | resultMdUpdater + relayCron + Discord webhook |

---

## 3. Backlog — Phase 3 (✅ ALL DONE 2026-05-27)

> **สถานะ:** 3.1–3.6 เสร็จครบแล้ว (ดู PROGRESS.md). ส่วนล่างนี้เก็บไว้เป็น historical spec record. **งานปัจจุบันอยู่ section 5 (Phase B1 done + Phase C upcoming).**

> **กฎ dispatch:** ทำทีละข้อ ตามลำดับ 3.1 → 3.2 → 3.3 → 3.4. ห้ามทำขนาน. ทุก task ji-ziyue audit ก่อน mark done. ห้ามเพิ่ม chat/spawn/WS infra กลับมา (pivot rule)

### 3.1 — Kanban event filter ใน TaskFeedSidebar (Worker: shihao, ขนาด: S)

**ไฟล์เดียว:** `web/src/components/TaskFeedSidebar.tsx`

**ทำ:**
1. เปลี่ยน `type Filter = 'all' | 'blocks'` → `type Filter = 'all' | KanbanEventEntry['kind']` (8 kinds: claimed/completed/blocked/decomposed/spawned/heartbeat/unblocked + all)
2. UI: เปลี่ยน chip 2 อัน → chip 8 อัน scrollable horizontal, **single-select** (ไม่ใช่ multi — keep simple)
3. Filter logic: `if (filter === 'all') return true; return ev.kind === filter;`
4. Persist filter ใน localStorage key `feedFilter` → load ตอน init

**Acceptance:**
- คลิก chip "completed" → list filter ลงเฉพาะ completed
- Refresh browser → chip ที่เลือกล่าสุดยังถูกเลือกอยู่
- typecheck clean, build pass

**ห้ามทำ:** เพิ่ม multi-select, เพิ่ม dependency ใหม่, แตะไฟล์อื่นนอกจาก TaskFeedSidebar.tsx

---

### 3.2 — resultMdUpdater → `result.events.log` (Worker: yefan, ขนาด: S)

**ไฟล์เดียว:** `server/watchers/resultMdUpdater.ts`

**ทำ:**
1. เปลี่ยน target path จาก `result.md` → `result.events.log` (relative to project root เหมือนเดิม)
2. ถ้า `result.events.log` ไม่มี → create with header `# Heaveneye event log (auto-appended by resultMdUpdater)\n`
3. Append format เดิม `## [ISO_TS] worker status → task [task_id]\n  - Status:\n  - Task:\n  - Board:\n`
4. เพิ่ม `result.events.log` เข้า `.gitignore`

**Acceptance:**
- worker complete event เกิด → daemon append entry ลง `result.events.log`
- `result.md` ไม่ถูก touch (verify: `stat result.md` mtime คงเดิม)
- `result.events.log` มี header + entries เรียงตามเวลา
- `.gitignore` มีบรรทัด `result.events.log`

**ห้ามทำ:** ลบ result.md, แตะไฟล์ daemon อื่น, เพิ่ม dep

---

### 3.3 — StatChart time window (Worker: yefan backend + shihao frontend, ขนาด: M)

**Backend:** `server/state/engine.ts` (+ index.ts endpoint)
1. ตรวจว่า engine state มี usage data ย้อนหลังเก็บไว้กี่วัน — ดู `state.getUsage24h()` implementation
2. ถ้าเก็บแค่ 24h → ต้องเพิ่ม persistence layer (อาจ daily aggregate file `~/.heaveneye/usage/<agent>-<YYYY-MM-DD>.json`)
3. เพิ่ม endpoint: `GET /api/usage?agent=X&window=24h|7d|30d` → bucket count = 24 / 7 / 30
4. ถ้า window=24h: keep existing behavior; 7d/30d: aggregate by day

**Frontend:** `web/src/components/StatChart.tsx`
1. เพิ่ม dropdown 24h/7d/30d ใน header
2. เปลี่ยน fetch URL ตาม window
3. Chart label เปลี่ยนตาม (hourly vs daily)

**Acceptance:**
- เลือก 24h → 24 bars (เหมือนเดิม)
- เลือก 7d → 7 bars แสดงรายวัน
- เลือก 30d → 30 bars
- ถ้าไม่มี data เก่าพอ → เห็น empty bars (ไม่ crash)
- typecheck + build pass

**⚠️ Risk:** ถ้า engine ไม่เก็บข้อมูลเก่า → yefan ต้องสร้าง persistence layer ใหม่. **ถ้า scope ใหญ่เกิน → block + report กลับ ji-ziyue ก่อนทำ**

---

### 3.4 — Discord channel config UI (Worker: yefan backend + shihao frontend, ขนาด: M)

**Backend:** `server/lib/discordConfig.ts` (new file)
1. Read/write `~/.heaveneye/discord.json` (NOT .env — เพราะ .env เปลี่ยน need restart)
2. Endpoint: `GET /api/config/discord` → return `{ webhookUrl: string | null }`
3. Endpoint: `POST /api/config/discord` body `{ webhookUrl }` → validate URL format + write file
4. Endpoint: `POST /api/config/discord/test` → ส่ง "ping from heaveneye" ไปยัง webhook URL ปัจจุบัน → return `{ ok, status }`
5. แก้ `lib/discordNotifier.ts` ให้อ่าน webhook URL จากไฟล์ก่อน fallback ไป .env

**Frontend:** `DiscordPanel.tsx` (existing)
1. เพิ่ม "⚙ Settings" button → modal เปิดมา
2. Modal: input webhook URL + Save button + Test button
3. Save → POST → success toast
4. Test → POST → toast แสดง result

**Acceptance:**
- กรอก URL ใหม่ → Save → ไฟล์ `~/.heaveneye/discord.json` มี URL ใหม่
- กด Test → Discord channel ได้รับ "ping from heaveneye"
- restart server → URL ใหม่ยังใช้อยู่ (persist OK)
- URL ไม่ valid → save reject 400

**ห้ามทำ:** เก็บ webhook URL ใน .env (เพราะ require restart), commit `discord.json` (ต้องอยู่ใน .gitignore)
---

### 3.5 — Maintenance & Stability Improvements (Completed 2026-05-27)

**ทำ:**
1. **TypeScript Typecheck Fixes**: แก้ไข TS compiler errors ใน `DependencyMap.tsx`, `ReportViewer.tsx`, และ `store.ts` ให้ `tsc --noEmit` ผ่านเป็น 0
2. **Discord Webhook Dynamic Reload**: แก้ไขให้ `discordNotifier.ts` โหลด Webhook URL จาก config file ทุกครั้งที่มีการเรียกใช้งาน (ไม่แคชที่ module load) ทำให้เปลี่ยนปุ๊บมีผลทันที
3. **RAM Alert Threshold Adjustment**: เปลี่ยน RAM default threshold เป็น 85% ของ RAM ทั้งระบบ (`totalmem() * 0.85`) แทนที่จะเป็น hardcoded 2 GB เพื่อป้องกัน false positive alert
4. **Dynamic Board Switcher**: เชื่อมโยง board state เข้ากับ Zustand store บนเว็บ ทำให้เปลี่ยนบอร์ดใน Reports dropdown แล้วตัวบอร์ด Dependency DAG เปลี่ยนตามแบบ Real-time โดยดึงข้อมูลผ่าน `/api/dag?board=...`
5. **JSONL Log Parser Header Skip**: แก้ไขตัวตรวจสอบ `isJsonL` ใน `ReportViewer.tsx` ให้ข้ามบรรทัดที่เป็น comment (เริ่มด้วย `#`) เพื่อแสดงผลข้อมูลใน `result.events.log` เป็นตารางได้ถูกต้อง
6. **DAG Zoom & Grab-to-Pan**: เพิ่มปุ่มควบคุมการซูม (Zoom Controls: 30%-150%) และความสามารถในการคลิกเมาส์ลากเลื่อนดูแผนภาพ (Grab-to-Pan) ในกล่องแสดง Dependency DAG เพื่อจัดการกับกราฟที่ยาวหรือใหญ่ล้นหน้าจอได้สะดวกรวดเร็ว

---

### 3.6 — Phase E: Monitoring & Security Enhancements (Completed 2026-05-27)

**ทำ:**
1. **Real-time Daemon Process Monitor**: เพิ่ม `cpuPercent` และ `ramBytes` ใน backend & frontend `GatewayHealth` interface. ทำการเรียก `ps -p <pid> -o %cpu,rss` เพื่อดึงข้อมูลมาแสดงผลในแบบ progress bar/gauges บนกล่อง SystemHealth
2. **Token Burn Rate Alerting**: เพิ่ม `burnRateLimitTokensPerMin` (default 50,000) ใน Alert Config เพื่อคอยเตือนเมื่อ agent ใช้ token เร็วเกินความจำเป็น (เก็บประวัติการใช้ token ในนาทีสุดท้าย และส่งคำเตือนไปยัง Discord, Tauri system alert, และ state logs เมื่อเกินขีดจำกัด)
3. **Agent Productivity Heatmap**: เพิ่ม API `/api/agent/:id/activity-heatmap` เพื่อดึงประวัติการทำงานย้อนหลัง 30 วันจาก SQLite databases ใน timezone กรุงเทพฯ (UTC+7) และนำมาแสดงผลเป็น GitHub-style heatmap grid พร้อมระบบ tooltip แสดงผลจำนวน action และวันที่เมื่อเอาเมาส์ไปชี้ใน DetailPanel
4. **Code Review & Clean Up**: ตรวจสอบการอ้างอิงเส้นทางโฟลเดอร์ผู้ใช้ และทำการย้ายไปใช้ค่าคงที่ `HOME` จาก `config.ts` ทั้งหมด แทนการอ้างอิง `process.env.HOME` แยกส่วนกัน เพื่อลดความเสี่ยงที่การทำงานใน sandbox profile จะได้เส้นทางต่างกันจนเกิดบั๊ก คลีนอัพโค้ดส่วนที่เกินและไม่ใช้งานออกพร้อมคอมไพล์ผ่านเรียบร้อย
5. **Top-level Virtual Office Map**: แทนที่ผังองค์กรการ์ดแบบเดิมด้วยห้องทำงานจำลอง Blueprint 2D (อยู่ใต้ SystemHealth) วางตำแหน่งโต๊ะคอมพิวเตอร์และป้ายชื่อของ Agent แต่ละคนตามพิกัดหน้าจอ และต่อวงจรควบคุมด้วย Framer Motion: เมื่อมีข้อความอัปเดตสเตตัสการส่งงานเสร็จ (เช่น yefan มีสถานะเป็น blocked หรือ done) ตัวละคร Rive Avatar ของเย่ฝานจะขยับเดินส่ายสะโพกโยกหัว (waddling walk) ข้ามหน้าจอไปวางเอกสารส่งงานบนโต๊ะของเมี่ยวอี (Hermes Lead) พร้อมแสดงเอฟเฟกต์พลุไอคอนกล่องงานเด้ง ก่อนจะเดินกลับมานั่งโต๊ะทำงานของตนเองตามปกติ (พร้อมทั้งออกแบบรูปสัญลักษณ์ตัวละครใหม่เป็น Emoji รูปผู้คนในสายงานต่างๆ 👩‍💼 👩‍✈️ 👨‍💻 และลดขนาดความสูงแผนที่ออฟฟิศจาก 620px ลงเหลือ 450px และขนาดโต๊ะกับ RiveAvatar เป็น size sm เพื่อความกระชับกะทัดรัดลงตัว)

---

## 4. Execution protocol

1. **เริ่ม 3.1 (shihao)** — quick win, แก้ไฟล์เดียว
2. ji-ziyue audit: ดู UI ใช้งานได้ + typecheck + persist works
3. **เริ่ม 3.2 (yefan)** — daemon migration
4. ji-ziyue audit: stat result.md mtime ไม่เปลี่ยน + events.log มี content
5. **เริ่ม 3.3 (yefan ก่อน backend, แล้ว shihao frontend)** — ถ้า yefan เจอ engine ไม่ persist → block + report
6. ji-ziyue audit: 3 windows ใช้งานได้
7. **เริ่ม 3.4 (yefan backend → shihao frontend)** — full stack
8. ji-ziyue audit: save + test webhook + persist after restart

**ทุก step:** `bunx tsc --noEmit` exit 0 + `bun run build` pass ก่อน mark done

---

## 5. Phase B+ — Isometric Office (live record)

### ✅ Phase B1 — Isometric 2.5D office (DONE 2026-06-03)
view-only dashboard → fake-iso 2.5D office. Spec เต็มที่ `plan.phase-b-isometric.md`.
- B1.1 iso projection util (`lib/iso.ts`) + diamond floor · B1.2 desks + billboards + depthZ
- B1.3 sprite characters (Nano Banana PNG + fallback) · B1.3b auto-fit layout
- B1.4 waddle/delivery บน iso coords · B1.5 depth polish (shadow + room zones + hover)
- commit 67fd7b1 · bundle 384.63 kB · tsc clean

### 🚧 Phase C — Liveness / task-driven (scoping 2026-06-06)
office ปัจจุบัน: delivery walk = real status-transition (→blocked/done → เดินไป anmaioyi) แต่ idle = นิ่งสนิท, working ไม่มี pose, ทุกคนเดินไปหา anmaioyi เท่านั้น.
**เป้า:** ทำให้ office "มีชีวิต" + การเคลื่อนไหวสะท้อน task flow จริง. Spec เต็มที่ `plan.phase-c-liveness.md` (กำลังร่าง).
- C0 fix WRAPPER_HALF_W stale comment (iso.ts:28 13→5.5) — พ่วงงานแรก
- C1 idle life (breathing bob ตอนว่าง) · C2 working pose (typing lean + desk glow pulse)
- C3 dependency-aware handoff (เดินส่งตาม kanban edge จริง ไม่ใช่ทุกคน→anmaioyi)
- C4 perf + bundle QA (7 ตัว animate พร้อมกันไม่ jank, ≤392 kB)

---

---

## 5. Out of scope (ตัดสินใจไม่ทำ)

- ❌ Chat กับ agent ผ่าน UI — CLI ไม่เหมาะ web
- ❌ Spawn session ใน dashboard — ใช้ terminal
- ❌ Model switcher UI — edit config.yaml + restart launchd กระชับกว่า
- ❌ Code-split lazy loading — bundle 367kB ไม่ใหญ่พอที่จะต้อง

---

## 6. กฎสำหรับ ji-ziyue / ทีม

- ทุก commit `bunx tsc --noEmit` exit 0
- 1 task = 1 commit (เล็ก ๆ ดีกว่าใหญ่)
- มี acceptance criteria วัดได้ก่อน start
- runtime verify (curl/click) ก่อน mark done
- ห้ามเพิ่ม dep ใหม่ถ้าไม่จำเป็น (กระทบ bundle size)
- ห้ามเพิ่ม chat/spawn/WS infra กลับเข้ามา (pivot rule)

---

_Plan rewrite 2026-05-23 20:30 by Ji Ziyue, post-pivot. v2 chat plan archived in git history (commits before 2026-05-23 evening)._
