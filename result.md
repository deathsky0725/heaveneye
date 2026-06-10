# Heaveneye — Ship Log (of record)

> Source of truth สำหรับ "ที่ ship + verified". Live tracker: `PROGRESS.md`. Plan: `plan.md`.
> Last rewrite 2026-05-23 20:30 by Ji Ziyue — **pivot กลับมา view-only dashboard** หลังเจอข้อจำกัดว่า claude/agy/hermes CLI ไม่รองรับ chat orchestration ผ่าน web UI

---

## 🎯 Scope ปัจจุบัน (post-pivot)

**Heaveneye = view-only monitoring dashboard** สำหรับ Hermes agents. สั่งงานจริง = ผ่าน terminal/claude CLI/gemini CLI โดยตรง.

**What it does:**
- มอนิเตอร์ agent ทุกตัว (ziyue, anmaioyi, wenshu, yanxin, jianfeng, shihao, yefan) แบบ real-time
- StatChart 24h, Token usage 5h, Inbox, Task feed, Discord embed preview, system health
- Kill worker button (per-agent)
- ⭐ Gateway start/stop button (RAM control)
- Native wrap ผ่าน Tauri (tray + hotkey + notification)
- Dark/Light theme

**What it does NOT do (rolled back 2026-05-23):**
- ❌ Chat กับ agent ผ่าน UI
- ❌ Spawn claude/agy session จาก dashboard
- ❌ Model switcher (สลับ MiniMax/GPT-4o)
- ❌ WebSocket /ws/agent + AgentLauncher + SessionView + Terminal pane + Settings

---

## v1 — Monitoring Dashboard ✅ (Pass 03-24, committed `bd5d2bb`)
Stack: Bun + Hono (7878) + React 19 + Zustand + Tailwind 4 + Rive.
Multi-board, model/board indicators, 5h panel, blocked indicator, 24h StatChart, DetailPanel, inactivity alert + kill, `/api/agent/:id/{detail,timeline,relay-status}`, Inbox filter, mini-timeline, HM2-REPORT pipeline. Typecheck clean. Infra (launchd 24/7): `protocol_guard.py`, `review_watcher.py`.

## v2 attempt — AgenticOS chat workspace ❌ ROLLED BACK 2026-05-23
ลองสร้าง chat/spawn UI สำหรับ claude/agy/hermes (Phase 0-5). **ติดข้อจำกัด:**
- claude `-p` mode = one-shot, ไม่เหมาะ multi-turn chat ผ่าน web
- agy ใช้ macOS Keychain → require user GUI session — backend process ที่ start ผ่าน non-shell context access ไม่ได้
- hermes CLI สั่งงานผ่าน kanban async — reply ไม่ stream กลับ chat ได้

→ **พี่เบญตัดสินใจ pivot กลับมา view-only** — ใช้ heaveneye แค่ดูสถานะ, สั่งงานจริงผ่าน terminal

## v2.1 — Gateway start/stop button ✅ (Phase 5.2 จากทีม, kept ในการ pivot)
- Backend `server/lib/gatewayControl.ts` + `POST /api/gateway/:id/{start,stop}` (allow-list, ziyue → 403)
- Frontend `GatewayButton.tsx` ใน AgentCard (เขียว=running click=stop, แดง=stopped click=start)
- Polling refresh after action

## v2.2 — Tauri native wrap ✅ (Phase 3.8 จากทีม, kept)
`src-tauri/` — system tray, global hotkey Ctrl+Shift+H, close→hide, notification plugin.

## v2.4 — OfficeMap UX critique fix ✅ (ji-ziyue 2026-05-27, Phase A)
หลังพี่เบญรีวิวว่า "ยังไม่ดูดีพอ" → แก้ 6 จุดใน `OfficeMap.tsx` + `ReportViewer.tsx`:
- **Calm semantics:** ลบ health-score แดง (idle=20/100 ทำให้ทั้งจอแดงน่ากลัว) → status pill (idle=เทาสงบ, แดงเฉพาะ `failed` จริง)
- **Hierarchy:** core agents (ziyue/anmaioyi) avatar `md` + ring → เด่นกว่า specialists
- **Fill space:** room gradient tint bands + org connection lines (active edge = green)
- **No overlap:** desk เหลือแค่ monitor (ลบ label ซ้ำ) · name+role+status รวมก้อนเดียว backdrop-blur
- **Feed order:** ReportViewer `rows.reverse()` → newest top
- build 382kB · tsc clean
- **Phase B (isometric office)** = vision ระยะยาว, ยังไม่เริ่ม

## v2.3 — Phase 3 design polish ✅ (kept)
theme.ts design tokens · motion layout transitions · RiveAvatar activity events · DataFlowParticles ambient + burst · glassmorphism · ToastContainer · ThemeToggle dark/light persist · open-source release files (README, SETUP, LICENSE, .env.example, config.example.yaml).

---

## ✂️ Rolled back 2026-05-23 20:30 (Phase 6 — Cleanup)

**Files deleted (19):**
- Backend: `server/adapters/*` (7 files), `server/routing/agentRouter.ts`, `server/lib/modelSwitch.ts`, `server/lib/profiles.ts`
- Frontend: `AgentLauncher`, `SessionView`, `SessionTabs`, `ChatPane`, `Terminal`, `CommandPalette`, `Settings`, `WorkspaceLayout`, `web/src/store/persistence.ts`
- Tests: `scripts/test_backend.ts` (tested removed endpoints)

**Endpoints removed:** `POST /api/agent/spawn`, `POST /api/agent/:type/spawn`, `GET /api/sessions`, `GET /api/agent/:sessionId/status`, `POST /api/agent/:sessionId/{send,kill}`, `POST /api/profile/:id/model`, `GET /api/profiles`, WS `/ws/agent`

**Endpoints kept (view + control):** `/api/health`, `/api/agents`, `/api/usage/{5h,24h}`, `/api/inbox`, `/api/events`, `/api/notifications`, `/api/stream` (SSE), `/api/agent/:id/{kill,detail,timeline,relay-status}`, `/api/gateway/:id/{start,stop}`

**Deps removed:** `@xterm/xterm`, `@xterm/addon-fit`, `yaml`

**Verify:**
- ✅ `bunx tsc --noEmit` exit 0
- ✅ `bun run build` 367kB (จาก 729kB ก่อน rollback — 50% shrink)
- ✅ `bun install` 3 packages removed

---

## 🚧 Backlog (post-pivot)
- เพิ่ม **kanban event filter / search** ใน TaskFeedSidebar (ตอนนี้แค่ all/blocks)
- resultMdUpdater daemon → `result.events.log` แทน append result.md เพื่อให้ ji-ziyue curate ได้สะดวก
- StatChart: ขยายดู 7-day / 30-day token trend
- Discord webhook: เพิ่มการตั้งค่า channel ใน UI

## 🚧 Phase 6 — Backlog 3.1 → 3.4 (sequential, ji-ziyue audit each)

### 3.1 — Kanban event filter (shihao) → dispatched t_a3bb6a3c · VERIFIED ✓
- TaskFeedSidebar: 2 chips → 8 single-select chips (all/claimed/completed/blocked/decomposed/spawned/heartbeat/unblocked)
- localStorage persist key 'feedFilter'
- Acceptance: 8 chips visible · click filter narrows list · refresh → chip stays selected · tsc clean · build 367kB

### 3.2 — resultMdUpdater → result.events.log (yefan) → VERIFIED ✓
- daemon appends to result.events.log instead of result.md
- .gitignore entry added
- Acceptance: result.md mtime unchanged (14:35) · events.log 1.3kB · .gitignore has entry

### 3.3 — StatChart time window (yefan BE → shihao FE) → VERIFIED ✓
- GET /api/usage/7d + /api/usage/30d endpoints + engine getUsage7d/getUsage30d
- Frontend: 24h/7d/30d window chips with adaptive fetch + labels
- t_23fcc5c6 ✅ verified by anmaioyi · build 368kB · tsc clean

### 3.4 — Discord channel config UI (yefan BE → shihao FE) → VERIFIED ✓
- t_cdf98834 ✅ GET/POST /api/config/discord + /test · ~/.heaveneye/discord.json persistence
- t_737d45c8 ✅ DiscordPanel Settings modal · build 371.78kB · URL pre-fill + Test + Save + toasts
- Backend endpoints verified with curl · persistence verified end-to-end

### 3.5 — Maintenance & Stability Release (Completed 2026-05-27) → VERIFIED ✓
- Fixed TypeScript compiler checks: `DependencyMap.tsx`, `ReportViewer.tsx`, and `store.ts` are strictly typed, allowing `tsc --noEmit` to pass with exit code 0.
- Resolved Discord webhook configuration reload: reads config file dynamically at runtime instead of caching URL at module load.
- Prevented RAM alerts false positives: default RAM threshold is computed dynamically as 85% of total system memory instead of static 2 GB.
- Implemented dynamic board switching: selecting a board in the Reports dropdown dynamically updates the Dependency DAG map using `/api/dag?board=...` and loading target SQLite database.
- Fixed JSONL parsing for logs: skips comment headers starting with `#` in `result.events.log` to render entries as clean tables.
- Added SVG Zoom & Grab-to-Pan: implemented interactive Zoom Controls (30% to 150%) and Grab-to-Pan mouse drag-scroll inside `DependencyMap` component to handle wide/tall graphs elegantly.

### 3.6 — Phase E: Monitoring & Security Release (Completed 2026-05-27) → VERIFIED ✓
- **Real-time Daemon Process Monitor**: Added `cpuPercent` and `ramBytes` to frontend & backend types. Implemented process statistics collection using `ps -p <pid> -o %cpu,rss` on macOS and dynamically rendered load gauges next to gateways.
- **Token Burn Rate Alerting**: Integrated `burnRateLimitTokensPerMin` (default 50,000) threshold config. Built UI form setting in the AlertSettings panel, backend rolling 1-min usage window lookup in engine, and automatic warnings routing to Discord webhooks, system alerts, and notification logs.
- **Agent Productivity Heatmap**: Added `/api/agent/:id/activity-heatmap` route to search Kanban databases, aggregate contribution counts by Bangkok date, and rendered a premium GitHub-style wrapped contribution grid with tooltips and legend in `DetailPanel`.
- Verified type safety via `bunx tsc --noEmit` (exit 0) and built successfully via `bun run build`.
- **Code Review & Clean Up**: Audited direct filesystem path usages and refactored multiple instances of hardcoded `process.env.HOME ?? '/Users/ben'` in `server/state/engine.ts` and `server/lib/alertConfig.ts` to use the standardized `HOME` path constant imported from `config.ts` to prevent path-resolution mismatches inside sandboxed profiles.
- **Top-level Virtual Office Map**: Swapped the card-based org chart for a dynamic 2D Virtual Office Blueprint workspace. Placed agents at absolute coordinates (desks with nameplates, screen glows, and status rings). Integrated a Framer Motion walk state machine: when a specialist transitions to `blocked` (waiting for review) or `done`, their Rive avatar "waddles" (utilizing rotation/bobbing keyframes) to Anmaioyi's desk, displays a floating "task delivery" badge with a particle explosion, pauses for 2 seconds, and walks back home. Redesigned avatar symbols to use expressive people-shape emojis (e.g. 👩‍💼, 👩‍✈️, 👨‍💻) and shrunked the entire office canvas height (from 620px to 450px) alongside smaller desk metrics and size-sm RiveAvatars to deliver a neat, highly compact workspace dashboard layout.

## Accuracy note
v2 attempt = bug ซ้อนหลายชั้น (stdio pipe → claude --resume cwd → SessionManager in-memory → keychain GUI session → SessionView messages leak across tabs). ทุก bug แก้ได้ทีละตัว แต่ architecture พื้นฐาน (CLI tools as chat backends) ไม่เข้ากับ web orchestration. ภายในเวลา 1 วันได้ insight: CLI tools = stay in terminal, dashboard = stay view-only. Pivot กลับ scope ที่เหมาะกว่า.
