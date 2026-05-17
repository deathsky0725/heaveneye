# AGENTS.md — Heaveneye Project Context

> โหลดอัตโนมัติเมื่อ agent ทำงานใน `/Users/ben/Documents/Agentic-OS/Projects/heaveneye/`

## ⭐ Shared team library

Persona + custom skill อยู่ที่ `~/Documents/Agentic-OS/Context/` (single source)
**ห้ามแก้ persona/skill ที่อยู่ใน project folder** — แก้ที่ Context/ เท่านั้น

### Personas to load (จาก `~/Documents/Agentic-OS/Context/personas/`)
- `anmaioyi.md` — coordinator (ถ้า task มี orchestration)
- `shihao.md` — Frontend dev (heaveneye web/)
- Backend dev (yefan) — ใช้ description ใน AGENTS.md นี้

## Project: Heaveneye Dashboard

ตาสวรรค์ — Real-time monitoring dashboard for พี่เบญ's multi-agent setup (Ji Ziyue + Hermes team)
ดู `plan.md` สำหรับ architecture + phase plan เต็ม

## Stack

- **Backend:** Bun + Hono + SSE (port 7878)
- **Frontend:** Vite + React 18 + TypeScript + Tailwind 4 + Zustand
- **Watchers:** chokidar (file tail) + bun:sqlite (kanban DB)

## Team Roles (Heaveneye scope)

- **Ji Ziyue (จื่อเยว่)** — เลขาส่วนตัวพี่เบญ (Claude Code, ภายนอก) — เขียน plan + สั่งงาน
- **An Maioyi (anmaioyi)** — coordinate task, monitor children, relay status
- **Shihao (shihao)** — frontend dev — แตะ `web/` + `server/` ของ heaveneye
- **Yefan (yefan)** — backend dev — pair กับ shihao ถ้า task ใหญ่
- Specialist อื่น (wenshu/yanxin/jianfeng) ปกติไม่เกี่ยว project นี้ — ยกเว้น cross-project task

## Working Directory

ทุกการแก้ไขทำใน `/Users/ben/Documents/Agentic-OS/Projects/heaveneye/` เท่านั้น:
- `server/` — Hono app, state engine, watchers
- `web/src/` — React app
- `plan.md` — architecture + phase plan + backlog

ห้าม:
- แก้ Hermes source (`~/.hermes/hermes-agent/`)
- แก้ Hermes profile config (`~/.hermes/profiles/<name>/`)
- git commit/push

---

## Handoff Loop Rules (บังคับทุก agent — ห้าม block เงียบ)

> Block + เงียบ = พี่เบญต้องเปิด dashboard เช็คเอง flow มันพัง

### H1 — Block reason ต้อง actionable

เวลา block task ระบุ 3 จุดขั้นต่ำ:
1. **What's done** — ทำอะไรเสร็จไปแล้ว
2. **What's blocking** — ติดอะไร
3. **Who can unblock + how** — ชื่อ + action ที่เขาควรทำ

```
❌ "review-required: model indicator added"
✅ "review-required: model indicator added. Cannot verify in browser
   (no Playwright in worker). @user: open http://localhost:5173,
   confirm model name shows under role, then complete this task."
```

### H2 — @mention คนรับช่วงต่อ

Top ของ comment ต้องมี `@<name>` — `@ji-ziyue` / `@user` / `@anmaioyi` — ห้ามตั้งสมมติฐานว่าใครจะมาเห็นเอง

### H3 — An Maioyi: ห้าม fire-and-forget

หลัง decompose:
1. **Keep parent task running** จนกว่า children จะเสร็จ/blocked
2. **Poll children** ทุก ~5 นาที
3. **Relay block** กลับให้ผู้สั่ง (parent task author) — ถ้าเป็น user → Discord reply, ถ้าเป็น ji-ziyue → comment ใน parent + mention
4. ห้าม mark parent done ก่อน children จะ resolve ทั้งหมด

### H4 — Block ต้อง mark blocked (ไม่ใช่ค้าง running)

Dashboard heaveneye แสดงสีเหลืองสำหรับ blocked → user เห็นทันทีว่ามีปัญหารอตัดสินใจ
ถ้าค้าง running เปล่าๆ user คิดว่ายังทำอยู่ → ไม่มาดู

---

## Acceptance Criteria เริ่มต้น

ทุก task ต้องส่ง:
1. โค้ดที่แก้ + ทดสอบจริง (UI4 ของ Shihao persona — เปิด localhost:5173)
2. `orchestration/tasks/results/{task_id}.result.md` สรุปไฟล์ที่แตะ + self-review
3. Block reason actionable ตาม H1 ถ้าทำเองไม่ได้

## Reference

- Personas อยู่ที่ `/Users/ben/Documents/Agentic-OS/Projects/yt-deathskylife/personas/` (shared across projects)
- Quick map ของ heaveneye codebase ดูใน `personas/shihao.md`
