# 👁️ heaveneye — Plan

> **ตาสวรรค์** — Real-time dashboard ที่มองเห็นทุก agent ในทีมพร้อมกัน บอกว่าใครทำอะไร ใช้ token ไปเท่าไหร่
> Author: จื่อเยว่ · For review: พี่เบญ · Date: 2026-05-15

---

## 1. เป้าหมาย

เปิดมาแล้วเห็นทันทีว่า:
1. **ใคร** กำลังทำงาน (จื่อเยว่ / เมี่ยวอี / เหวินซู / เหยียนซิน / เจี้ยนเฟิง)
2. **ทำอะไร** (task title + tool ล่าสุดที่เรียก)
3. **สถานะ** (idle / thinking / working / done / failed)
4. **Token usage** สะสมวันนี้ ต่อคน

เปิดเอง manual ตอนพี่เบญอยากดู (ไม่ auto-start), local-only ไม่ผูก cloud

---

## 2. แหล่งข้อมูล

| Source | Path | ให้อะไร |
|---|---|---|
| **Hermes events** | `Projects/yt-deathskylife/orchestration/status.jsonl` | "ใคร กำลังทำ task ไหน" (semantic) |
| **Claude transcripts** | `~/.claude/projects/**/*.jsonl` | token usage + tool calls (mechanical) |
| **Task specs** | `Projects/yt-deathskylife/orchestration/tasks/*.task.md` | รายละเอียด task (อ่านเพิ่ม on-demand) |

### Event schema ของ Hermes (ที่เห็นจริง)
```json
{"ts":"2026-05-14T21:39:00Z","agent":"anmaioyi","task_id":"t_cc51f087","event":"completed","payload":{...}}
```
- `event` ที่พบ: `completed`, `decomposed`
- คาดว่ามีเพิ่ม: `claimed`, `started`, `failed`, `plan_updated` (ตาม persona doc)

### Claude transcript schema (ที่ใช้)
แต่ละ line คือ message; อ่านเฉพาะ `type: "assistant"` ที่มี `message.usage`:
```json
{"type":"assistant","timestamp":"...","sessionId":"...","cwd":"...",
 "message":{"usage":{"input_tokens":N,"output_tokens":N,
                    "cache_creation_input_tokens":N,"cache_read_input_tokens":N}}}
```

### Mapping `agent` → Claude session (จุดที่ยังต้องทดลอง 🟡)
สมมติฐาน: Hermes spawn `claude` CLI ตอน task เริ่ม — session ที่มี `cwd` ตรงกับ workspace ของ task และอยู่ในช่วงเวลาที่ task active = ของ agent นั้น
**Phase 1 จัดการแบบ heuristic:** จับคู่ด้วย time window + cwd; ถ้าจับไม่ได้ → แสดง token รวมแยกอีก bucket ชื่อ "unattributed"

---

## 3. สถาปัตยกรรม

```
┌──────────────────────────────────────────────────────────┐
│ Backend (Bun + Hono, port 7878)                          │
│                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ status      │    │ transcript   │    │ state        │ │
│  │ watcher     │───▶│ watcher      │───▶│ engine       │ │
│  │ (chokidar)  │    │ (chokidar)   │    │ (in-memory)  │ │
│  └─────────────┘    └──────────────┘    └──────┬───────┘ │
│                                                 │         │
│  GET /api/agents (snapshot) ────────────────────┤         │
│  GET /api/stream (SSE)      ────────────────────┘         │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼ SSE
┌──────────────────────────────────────────────────────────┐
│ Frontend (Vite + React + Tailwind + Rive)                │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ จื่อเยว่ │  │ เมี่ยวอี│  │ เหวินซู │  │ เหยียนซิน│ │
│  │  [Rive]  │  │  [Rive]  │  │  [Rive]  │  │  [Rive]  │ │
│  │ 🟢 work  │  │ 🟡 plan  │  │ ⚪ idle  │  │ ⚪ idle  │ │
│  │ 12.4k tk │  │  8.2k tk │  │   0 tk   │  │   0 tk   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────┘
```

### State machine ของแต่ละ agent
```
idle ──claimed──▶ thinking ──tool_use──▶ working ──completed──▶ done ─(60s)─▶ idle
                       ▲                       │
                       └──────tool_result──────┘
                                               
       └──failed──▶ failed ─(60s)─▶ idle
```
- `thinking` = หลัง claim แต่ยังไม่มี tool call (กำลังคิด/อ่าน)
- `working` = มี tool call ภายใน 10s ล่าสุด
- `done` = task completed (โชว์ 60s แล้วกลับ idle)

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun** | เร็ว, มี watcher/server/bundler ในตัว, TS native |
| HTTP | **Hono** | เบา, รองรับ SSE native, dev experience ดี |
| File watch | **chokidar** | reliable cross-platform, รองรับ glob |
| Frontend build | **Vite** | HMR เร็ว, config น้อย |
| UI | **React 18 + Tailwind 4** | คุ้นมือ, ทำการ์ดเร็ว |
| Character | **`@rive-app/react-canvas`** | state machine + lightweight |
| State (frontend) | **Zustand** | simple, ไม่ overkill |

---

## 5. โครงโฟลเดอร์

```
Projects/heaveneye/
├── plan.md                    ← ไฟล์นี้
├── README.md                  (เขียนทีหลัง)
├── package.json
├── bun.lockb
├── tsconfig.json
├── server/
│   ├── index.ts               (Hono app + SSE)
│   ├── watchers/
│   │   ├── hermes.ts          (status.jsonl)
│   │   └── claude.ts          (~/.claude/projects/**)
│   ├── state/
│   │   ├── engine.ts          (event → state)
│   │   └── types.ts
│   └── config.ts              (paths, agent roster)
├── web/
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── RiveAvatar.tsx
│   │   │   └── TokenBadge.tsx
│   │   ├── store.ts           (Zustand + SSE client)
│   │   └── styles.css
│   └── public/
│       └── rive/              (.riv files)
└── scripts/
    └── dev.sh                 (รัน server + web พร้อมกัน)
```

---

## 6. Rive character

### แผน asset
1. ค้น [rive.app/community](https://rive.app/community) หา character ฟรีที่:
   - มี state machine `idle / working / happy / sad` (หรือใกล้เคียง)
   - License อนุญาตใช้ส่วนตัว
2. ถ้าไม่เจอ character ครบ 5 ตัวที่ต่างกัน → ใช้ตัวเดียวกันแต่ tint สีต่าง (จื่อเยว่ = ชมพู, เมี่ยวอี = ม่วง, เหวินซู = ฟ้า, เหยียนซิน = ส้ม, เจี้ยนเฟิง = เขียว)
3. Phase 2 ค่อยทำ asset เฉพาะตัวให้แต่ละ persona

### State inputs ที่ Rive ต้องมี
- `working` (boolean) — ขยับเร็ว
- `idle` (boolean) — หายใจช้าๆ
- `celebrate` (trigger) — เด้งตอน task done

---

## 7. Phase plan

### Phase 1 — MVP (เป้า: รันได้ เห็น 5 ตัวขยับ จริงตามสถานะ)
- [ ] 1.1 Scaffold โครงโฟลเดอร์ + Bun init + Vite init
- [ ] 1.2 Server: Hono + SSE + mock data
- [ ] 1.3 Frontend: AgentCard + Rive placeholder (emoji ก่อน) + รับ SSE
- [ ] 1.4 Watcher: parse `status.jsonl` → push event
- [ ] 1.5 Watcher: parse Claude transcripts → token aggregation ต่อ session
- [ ] 1.6 State engine: รวม 2 stream เป็น snapshot ต่อ agent
- [ ] 1.7 หา Rive characters + integrate
- [ ] 1.8 Polish: layout, สีประจำตัว, transitions
- [ ] 1.9 README + วิธีรัน

### Phase 2 — Enhancement (ทำเมื่อ Phase 1 stable)
- [x] รองรับหลาย Hermes board / project (kanban watcher อ่านทุก DB) ✅ 2026-05-16
- [x] Model indicator ต่อ card (currentModel) ✅ 2026-05-16
- [x] Board indicator ต่อ card (currentBoard) ✅ 2026-05-16
- [x] 5-hour usage panel (rolling window per model) ✅ 2026-05-16
- [ ] **Handoff loop ชั้น 1** — แสดง "needs review / blocked" indicator + reason ใน AgentCard เมื่อ task ของ agent นั้น blocked (เพื่อไม่ให้พี่เบญต้องถามเองว่าใครค้าง)
- [ ] **Handoff loop ชั้น 2** — Persona rule "ห้าม block เงียบ" + An Maioyi auto-poll children + relay block reason กลับผู้สั่ง
- [ ] กราฟ token usage รายชั่วโมง / รายวัน
- [ ] Task history panel (คลิกเปิดดู task ที่ผ่านมา)
- [ ] Detection จื่อเยว่ vs Hermes team แม่นขึ้น
- [ ] ส่ง model name ใน api_request ของ kanban worker (ตอนนี้ kanban worker mode ไม่ trigger hook → model ไม่เคยส่ง → UsagePanel แสดงเป็น "Unknown")

### Phase 3 — Nice to have / Backlog
- [ ] **Handoff loop ชั้น 3 — Auto notification** (กำหนดวันหลัง — ใหญ่กว่าชั้น 1+2)
  - Heaveneye watcher fire Discord webhook เมื่อมี `blocked`/`crashed`/`timed_out` event บน kanban
  - หรือ trigger จื่อเยว่ CLI prompt อัตโนมัติ ("task X blocked — please review") เพื่อสร้าง feedback loop จริงตอน user ไม่อยู่หน้า dashboard
  - เป้าหมาย: ระบบ self-heal — user ไม่ต้องโผล่หน้าจอเองจะรู้ทุกครั้งที่ทีมต้องการความช่วยเหลือ
- [ ] **Token tracking สำหรับ kanban-worker sessions** — ตอนนี้ workers ไม่ fire hook → token ไม่เข้า dashboard. ทางเลือก: อ่าน session JSON (`~/.hermes/profiles/<name>/sessions/*.json`) หรือ patch Hermes ให้ fire hook
- [ ] Custom Rive asset เฉพาะตัวให้แต่ละ persona
- [ ] Sound effect (เบาๆ ตอน complete)
- [ ] Dark/light mode

---

## 8. ความเสี่ยงและสมมติฐาน

| ความเสี่ยง | วิธีรับมือ |
|---|---|
| Map agent → Claude session ไม่แม่น | Phase 1 ใช้ heuristic + show "unattributed" bucket; Phase 2 หาวิธีแม่นขึ้น (env var, marker file, etc.) |
| Hermes ยังมี event ไม่ครบ (เห็นแค่ `completed` กับ `decomposed`) | State engine handle event ที่ไม่รู้จัก = noop; เพิ่ม event ใหม่ได้ทีหลัง |
| Rive character ฟรีคุณภาพไม่ดี | Fallback ใช้ emoji + CSS animation; พี่เบญตัดสินใจอีกที |
| status.jsonl โต/หมุน | Phase 1 อ่านครั้งเดียวตอน start + tail ใหม่ — โอเคถ้าไฟล์ไม่ใหญ่มาก |
| Claude transcripts ใหญ่มาก (หลายร้อย MB) | อ่านเฉพาะไฟล์ที่ mtime > 24h + parse แบบ streaming |

---

## 9. การตัดสินใจที่ได้รับการอนุมัติแล้ว ✅

1. **Port**: `7878` ✅
2. **Auto-open browser**: ไม่ — พี่เบญเปิดเอง ✅
3. **ภาษา UI**: ชื่อ agent + คำสถานะเป็นไทย, technical term เป็นอังกฤษ ✅
4. **Rive fallback**: ถ้าหา 5 ตัวต่างกันไม่ได้ → ใช้ตัวเดียวกัน tint สีต่าง ✅

---

## 10. Ready check (กดอนุมัติเมื่อพร้อม)

- [ ] อ่าน plan แล้ว เข้าใจตรงกัน
- [ ] ตอบคำถามใน §9 แล้ว
- [ ] ให้ start Phase 1.1
