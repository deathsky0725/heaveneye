# Agent CLI Reference (verified 2026-05-20 by Ji Ziyue)

Pre-spike reference for Phase 1 adapters. All 3 CLIs installed + logged in + verified on this machine.

---

## 1. Claude Code — `claude` (v2.1.146, `/opt/homebrew/bin/claude`)

**Headless spawn (streaming — recommended for adapter):**
```bash
claude -p "PROMPT" --output-format stream-json --verbose
```
- Emits **JSONL** (one JSON per line). Event types observed:
  - `{"type":"rate_limit_event", ...}`
  - `{"type":"system","subtype":"init","session_id":"...","cwd":"...","tools":[...],"model":"...","mcp_servers":[...]}`
  - `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}],"usage":{...}},"session_id":"..."}`
  - `{"type":"system","subtype":"post_turn_summary","status_category":"review_ready",...}`
  - `{"type":"result","subtype":"success","result":"...","session_id":"...","total_cost_usd":N,"usage":{...},"duration_ms":N}`
- ⚠️ `stream-json` REQUIRES `--verbose` (errors without it)

**Headless one-shot (simpler):**
```bash
claude -p "PROMPT" --output-format json
# → single {"type":"result","result":"...","session_id":"...","total_cost_usd":N,...}
```

**Resume session:** `claude --resume <session_id> -p "follow up"`

**Adapter notes (server/adapters/claudeCode.ts):**
- Parse JSONL line-by-line → map to AgentEvent (text deltas from `assistant`, completion from `result`)
- Capture `session_id` from first `system/init` event → store for resume
- `total_cost_usd` + `usage` available in `result` event → feed cost tracking (Phase 4.2)
- Auth: uses logged-in session, `apiKeySource: "none"` (subscription/OAuth)

---

## 2. Antigravity — `agy` (v1.0.0, `/Users/ben/.local/bin/agy`)

**Flags (from `agy --help`):**
- `-p` / `--print` / `--prompt` — run single prompt non-interactively
- `-i` / `--prompt-interactive` — initial prompt then continue session
- `-c` / `--continue` — continue most recent conversation
- `--conversation <id>` — resume specific conversation by ID
- `--add-dir <path>` — add directory to workspace (repeatable)
- `--dangerously-skip-permissions` — auto-approve all tool requests (**needed for headless automation**)
- `--print-timeout <dur>` — print mode wait timeout (default 5m)
- `--sandbox` — restricted terminal mode
- Subcommands: `install`, `plugin`, `update`, `changelog`

**Headless spawn:**
```bash
agy -p "PROMPT" --dangerously-skip-permissions --add-dir /path/to/workspace
# → plain TEXT output (NOT JSON). e.g. "ok"
```

**Output format:** ⚠️ **plain text only** — no `--output-format` flag exists. agy prints the final response as text. Adapter must treat stdout as text stream (no structured events like claude).

**Resume:** `agy --conversation <id> -p "follow up"` OR `agy -c -p "..."` (most recent)

**Storage location:** `~/.gemini/antigravity-cli/` (XDG base spec: `$XDG_STATE_HOME` or fallback)
- `conversations/*.pb` — binary protobuf conversation files (one per conversation, UUID names)
- `implicit/*.pb` — implicit/implied trajectory files
- `settings.json` — CLI settings (colorScheme, trustedWorkspaces)
- `installation_id` — unique installation identifier
- `log/cli-*.log` — CLI operation logs
- `brain/` — brain/knowledge storage
- `cache/` — cached data

**Finding (spike 1.3):** `agy` does NOT print conversation ID to stdout after a print run. To retrieve conversation IDs, scan the `conversations/` directory after a run — the `.pb` file names ARE the conversation UUIDs. List with:
```bash
ls ~/.gemini/antigravity-cli/conversations/
# → d9bfe0dc-bd1a-40c7-b2a9-c3184ecae8e4.pb
```
To resume: `agy --conversation <uuid> -p "follow up"`

**Auth:** Google OAuth (browser first-run). MCP support via `mcp_config.json` + `/mcp` command (interactive).

**Adapter notes (server/adapters/antigravity.ts):**
- stdout = plain text → AgentEvent as text chunks (no token-level structure)
- Always pass `--dangerously-skip-permissions` for unattended worker use
- Pass workspace via `--add-dir`
- Session resume needs conversation id discovery — **spike 1.3 must solve this**
- No native cost/usage data (unlike claude) → cost tracking limited for agy

---

## 3. Hermes — `hermes` (v0.14.0, `/Users/ben/.local/bin/hermes`)

Already integrated in heaveneye v1 (watchers + kanban CLI + kill endpoint). Adapter wraps existing:
- spawn → `hermes kanban create --assignee X`
- stream → existing watchers (hermes-events.jsonl, kanban DB) + SSE
- send → kanban comment / inbox jsonl
- kill → existing `/api/agent/:id/kill`

---

## Adapter interface (target shape — Phase 0.1)

```typescript
// server/adapters/types.ts
export interface AgentEvent {
  type: 'text' | 'tool_use' | 'status' | 'result' | 'error';
  sessionId: string;
  data: unknown;        // type-specific payload
  ts: number;
}
export interface AgentStatus {
  sessionId: string;
  state: 'spawning' | 'running' | 'idle' | 'done' | 'error';
  costUsd?: number;
  model?: string;
}
export interface AgentAdapter {
  type: 'claude-code' | 'antigravity' | 'hermes';
  spawn(prompt: string, cwd: string): Promise<string>;          // → sessionId
  stream(sessionId: string): AsyncIterable<AgentEvent>;
  send(sessionId: string, message: string): Promise<void>;
  status(sessionId: string): AgentStatus;
  kill(sessionId: string): Promise<void>;
}
```

---

## Key differences (adapter design implication)

| Aspect | claude | agy | hermes |
|---|---|---|---|
| Output structure | JSONL (rich) | plain text | watcher events |
| Session id | from `system/init` | needs discovery | task id |
| Cost data | ✅ in result | ❌ none | token watcher |
| Resume | `--resume` | `--conversation` | new task |
| Tool approval | auto | `--dangerously-skip-permissions` | persona |

**Design decision:** AgentEvent must be a union flexible enough to carry both structured (claude) and unstructured (agy text) — `data: unknown` + per-type parsing keeps it clean.
