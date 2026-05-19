# T5: Layout overflow fix — verification results

## Changes made

### 1. App.tsx — grid ratio narrowed to free specialist row space
- `lg:grid-cols-[1fr_2fr]` → `lg:grid-cols-[260px_1fr]`
  - Left column (ziyue) fixed at 260px instead of fluid 1fr
  - Right column now gets remaining space, giving specialist row more room

### 2. AgentCard — compact prop for specialist row
- Added `compact?: boolean` prop
- When `compact=true`: padding `p-3` (vs `p-5`), avatar `w-16 h-16 text-4xl` (vs `w-24 h-24 text-5xl`), gap `gap-3` (vs `gap-4`)
- Team badge gets `shrink-0` to prevent it from being clipped
- Role line gets `truncate` to ensure ... appears when text overflows container

### 3. RiveAvatar — size prop (sm/md)
- `size='sm'` → 64×64px avatar with 4xl emoji
- `size='md'` → 96×96px avatar with 5xl emoji (unchanged default)

### 4. Specialist row in App.tsx — compact cards + tighter gap
- `gap-4` → `gap-3`
- `<AgentCard key={id} agent={a} />` → `<AgentCard key={id} agent={a} compact />`

## Expected visual outcome

**1920×1080:**
- 5 specialist cards all visible in one row — Thai names clipped with `→` abbreviations
  - "ชินสุวรรณ" → clip, "เจินหยวนไฟแนนเชียล" → clip, etc.
- shihao + yefan cards visible (no overflow)
- ziyue in left column still fits

**1440×900:**
- No horizontal scrollbar
- Specialist row doesn't overflow

## Browser verification required

Dev server running at http://localhost:5173

Manual checks needed:
1. Resize browser to 1920×1080 — all 5 specialist cards visible
2. Resize browser to 1440×900 — no horizontal scrollbar
3. Long Thai names truncated properly (end with …)
---

# Updates after T5 (appended 2026-05-18 by Ji Ziyue)

> **Note for An Maioyi**: plan.md still reflects May 16 spec. This section is the authoritative shipped log for Pass 03 onwards. Read this BEFORE quoting Phase 2 status.

## Phase 2 — actual ship status (revised)

| Item | Status | Ship Pass | Evidence |
|---|---|---|---|
| Multi-board support | ✅ shipped | Pass 03 | `currentBoard` tag on AgentCard |
| Model indicator | ✅ shipped | Pass 03 | `agent.currentModel` shown in AgentCard role line |
| Board indicator | ✅ shipped | Pass 03 | colored badge in `currentTask` row |
| 5-hour usage panel | ✅ shipped | Pass 03 | `Usage5hPanel` component + `/api/usage/5h` |
| Handoff loop ชั้น 1 (blocked indicator on card) | ✅ **shipped** | Pass 03/05 | AgentCard.tsx: `border-l-4 border-amber-400` when `status==='blocked'` + `blockReason` text under task |
| กราฟ token รายชั่วโมง (24h) | ✅ **shipped** | Pass 09 | `StatChart.tsx` — 24 hourly bars, click "📊 history" on any AgentCard, also embedded in DetailPanel |
| Task history panel | ✅ **shipped** | Pass 11 | `DetailPanel.tsx` slide-in side panel: tool breakdown + session timeline + StatChart. Triggered by clicking AgentCard |

## Phase 3 (formerly backlog) — partial ship

| Item | Status | Ship Pass |
|---|---|---|
| Inactivity alert + kill button (3 tiers: alert/stall/stuck) | ✅ shipped | Pass 10 | `alertDuration()` in `lib/idle.ts` + kill button with confirm + `POST /api/agent/:id/kill` |
| Per-agent detail endpoint `/api/agent/:id/detail` | ✅ shipped | Pass 11 | yefan W1; returns `{toolBreakdown, sessionTimeline, currentSession}` |
| Per-agent timeline endpoint `/api/agent/:id/timeline` | ❌ NOT yet | (Pass 13c failed) | yefan attempted on Gemini/DeepSeek/NIM all failed; rolled back to MiniMax baseline |
| Inbox unread filter (exclude own + system entries) | ✅ shipped | Pass 12 | `InboxPanel.tsx`: `filteredInbox` excludes `from==='ji-ziyue'` and `event==='inbox_init'` |
| History button stopPropagation fix | ✅ shipped | Pass 12 | clicking history no longer opens DetailPanel |
| Mini-timeline 8 colored dots inline in AgentCard | ✅ shipped | Pass 13 (manual) | User manually added after worker file-corruption incidents |
| HM2-REPORT automation (anmaioyi auto-poll + relay) | ❌ NOT shipped | — | Spec exists in anmaioyi persona but no auto-subscribe wiring; Ji Ziyue still polls manually |
| Auto Discord notification | 🟡 partial | — | Discord adapter online (`@An Maioyi` works); no auto-task-completion notify wired |
| Token tracking for kanban-worker subprocess | ❌ NOT shipped | — | only top-level agents tracked in tokenEvents24h |
| Custom Rive assets / sound effects / dark-light mode | ❌ NOT shipped | — | still backlog |

## Infrastructure added 2026-05-18

| Component | Purpose |
|---|---|
| `~/.hermes/scripts/protocol_guard.py` + launchd daemon `ai.hermes.protocol-guard` | Auto-handoff comments when worker silent-exits / crashes / iter-exhausts — posts git diff so Ji Ziyue can review |
| `Context/team-state.md` (single source of truth) | Active experiments, canonical profile names, decisions, open investigations. Auto-loaded by both Ji Ziyue + An Maioyi at session start |
| `Context/anmaioyi-inbox.jsonl` + `anmaioyi-outbox.jsonl` | Bidirectional handoff channel between Ji Ziyue ↔ An Maioyi |
| anmaioyi persona Rule HM0-LOAD | Mandatory read team-state.md + inbox at session start |
| Fix to anmaioyi USER.md | Removed tainted `seuahao`/`yehfan` typos that were causing dispatcher to drop sub-tasks |

## Active investigation (not in plan.md)

Paradigm regression study — see `~/.claude/projects/-Users-ben-Documents-Agentic-OS/memory/paradigm_regression_observations.md` (Ji Ziyue side). MiniMax shows "won't declare done" bias (block-review or iter-spin). Free-tier OpenRouter models (Gemini, DeepSeek, Nemotron, qwen3-coder) tested: all fail either with rate limits, silent exits, file corruption, or tool-calling incompatibility. NIM direct endpoint tested for yefan — config loaded but worker crashed silently before LLM call (Hermes OpenAI client may not accept inline `api_key:` in top-level model config). yefan rolled back to MiniMax for stability.

## Open items / next plan candidates

1. HM2-REPORT automation — wire anmaioyi to `kanban_subscribe` or use cron poll pattern so she reports without Ji Ziyue triggering
2. plan.md / result.md auto-update hook — post-task-complete hook that appends to result.md so docs don't drift
3. Re-render EP001 t_77a9f59a (jianfeng video task — iteration budget hit earlier)
4. Token tracking for sub-agents (kanban-worker children)
5. /api/agent/:id/timeline endpoint (Pass 13c retry on stable model)
