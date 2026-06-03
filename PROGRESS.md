# 📊 Heaveneye — Progress Tracker

> **Status: view-only dashboard (post-pivot 2026-05-23, all phases complete 2026-05-27)**
> สั่งงาน agent จริง = ใช้ terminal/claude CLI/gemini CLI โดยตรง. Heaveneye = ดูสถานะ + ปุ่ม control แค่ที่จำเป็น

Last updated: 2026-05-27 by anmaioyi (synced with result.md)
Current phase: **All Phase 3 tasks COMPLETE — awaiting new backlog from พี่เบญ**

---

## Architecture (ปัจจุบัน)

```
Hermes profiles                 Heaveneye Backend         Frontend
─────────────────               ──────────────────       ─────────
gateways (launchd 24/7)         Bun + Hono :7878         React 19 + Zustand
                                                          + Tailwind 4 + Framer Motion
  ziyue (core, Claude)          /api/health
  anmaioyi (MiniMax)            /api/agents
  wenshu/yanxin/jianfeng        /api/usage/*             ← SSE /api/stream
  shihao/yefan                  /api/inbox
                                /api/events
  status.jsonl ─────────────►   /api/agent/:id/*         ← OfficeMap (Interactive 2D)
  kanban events  ───────────►   /api/gateway/:id/*       ← GatewayButton
  inbox.jsonl   ────────────►   chokidar watchers        ← Inbox/TaskFeed
  HM2-REPORT pipeline ──────►   relayCron                ← DetailPanel / Log
```

**Tauri wrap:** `src-tauri/` — system tray, Ctrl+Shift+H toggle, notification plugin

---

## ✅ Done

| Component | Files / Features |
|-----------|------------------|
| **v1** Monitoring Dashboard | Multi-board, model/board indicators, 5h panel, 24h StatChart, DetailPanel, inbox filter, mini-timeline |
| **v2.1** Gateway start/stop | Backend `/api/gateway/:id/{start,stop}` + Frontend GatewayButton.tsx |
| **v2.2** Tauri native wrap | src-tauri/ — system tray, global hotkey Ctrl+Shift+H, close→hide, notification plugin |
| **v2.3** Design polish | theme tokens, RiveAvatar, DataFlowParticles, glassmorphism, ToastContainer, ThemeToggle |
| **3.1** Kanban event filter | TaskFeedSidebar: 2 chips → 8 single-select chips, localStorage persist |
| **3.2** resultMdUpdater → result.events.log | daemon appends to result.events.log, .gitignore updated |
| **3.3** StatChart time window | GET /api/usage/7d + /api/usage/30d + frontend 24h/7d/30d chips |
| **3.4** Discord channel config UI | GET/POST /api/config/discord + /test + ~/.heaveneye/discord.json persistence |
| **3.5** Maintenance | TS typecheck fixes, Discord webhook dynamic reload, RAM threshold 85%, dynamic board switcher, JSONL header skip, DAG zoom+pan |
| **3.6** Monitoring & Security | CPU/RAM live gauges, token burn rate alerting, agent heatmap 30d, path cleanup (HOME constant), 2D Virtual Office Map with waddling avatars |
| **A.1** OfficeMap UX fix (ji-ziyue) | health-score แดง → calm status pill (idle=เทา, แดงเฉพาะ failed) · room tint bands + clearer labels · core (ziyue/anmaioyi) avatar md + ring · org connection lines (active=green) · desk de-duped (no label, monitor only) · name+role+status รวมก้อนเดียว backdrop-blur |
| **A.2** Report feed order fix | ReportViewer renderJsonL `rows.reverse()` → newest event top |

**Build:** `bunx tsc --noEmit` clean · `bun run build` = **382 kB client bundle**

---

## ❌ Deleted & Rolled Back

**Phase 6 Cleanup (2026-05-23):**
- Chat/spawn UI (AgentLauncher, SessionView, ChatPane, Terminal, etc.)
- Model switcher UI
- WebSocket /ws/agent
- v2 attempt bugs: stdio pipe, keychain GUI session, message leaks

**Deleted 2026-05-27 (unused features):**
- Dependency Map (DependencyMap.tsx + `/api/dag`)
- Discord Panel (DiscordPanel.tsx + `/api/config/discord` + `/api/config/discord/test`)
- Weekly Digest (weeklyDigest.ts + `/api/config/digest`)

---

## 🚧 Backlog

**ว่างเปล่า** — ทุก Phase 3 task (3.1–3.6) เสร็จหมดแล้ว ✅

รอพี่เบญสั่งงาน Phase 4 หรือ backlog ใหม่ค่ะ

---

## Team

| Role | Name | Scope |
|------|------|-------|
| Owner | พี่เบญ (Deathsky) | สั่งงานผ่าน Ji Ziyue |
| Coordinator | Ji Ziyue (จื่อเยว่) | เขียน plan, สั่งงาน team |
| Lead | An Maioyi (เมี่ยวอี) | orchestrate + monitor |
| Frontend | Shihao (ซิ่วเอา) | web/src/ + server/ (frontend parts) |
| Backend | Yefan (เย่ฝาน) | server/ backend dev |

---

## ✅ Phase B1 — Isometric Office COMPLETE (2026-06-03)

5/5 tasks done · view-only dashboard → isometric 2.5D office:
- **B1.1** t_5071403b — iso projection util (`lib/iso.ts`) + diamond floor
- **B1.2** t_887ede79 — desks (IsoDesk cuboid) + agent billboards + depthZ z-sort
- **B1.3** t_48999e8d — sprite-ready characters (Nano Banana PNGs + emoji fallback)
- **B1.3b** t_e01ec936 — auto-fit layout balance (bbox normalize, x 18-86 centered)
- **B1.4** t_cf1fcc40 — waddle/delivery animation on iso (isoUnproject + depthZFromCoords)
- **B1.5** t_0ff87574 — depth polish (ground shadow + 3 room zones + hover raise/ring)

**Autonomous flow proven:** ji-ziyue directive → inbox-watcher daemon → anmaioyi (M3) audit B1.5 → unblock+complete → outbox+Discord report. No manual poke, no approval-asking (Directive Authority Protocol works).
build 384.63 kB · tsc clean · no new npm deps.
