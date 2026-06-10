# Heaveneye Architecture

## System Overview

Heaveneye is a real-time unified workspace for AI coding agents. It connects to Claude Code, Antigravity CLI (agy), and Hermes, providing a single UI for spawning, monitoring, and interacting with all three.

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Zustand + Tailwind 4 + Motion + xterm.js)    │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────────────┐ │
│  │ AgentCards  │ │ ChatPane     │ │ TerminalPane (xterm.js)  │ │
│  │ (monitor)   │ │ (messaging)  │ │ (stdout from agents)     │ │
│  └──────┬──────┘ └──────┬──────┘ └────────────┬───────────────┘ │
└─────────┼────────────────┼────────────────────┼─────────────────┘
          │ SSE (events)   │ WebSocket (cmds)  │ SSE (streams)
┌─────────┴────────────────┴────────────────────┴─────────────────┐
│  Backend (Bun + Hono) — Agent Orchestration Layer                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  AgentAdapter interface (unified abstraction)             │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐  │ │
│  │  │ ClaudeCode │  │ Antigravity  │  │ Hermes            │  │ │
│  │  │ Adapter    │  │ Adapter      │  │ Adapter           │  │ │
│  │  └────────────┘  └──────────────┘  └───────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐ ┌────────────┐ ┌────────────────────────────┐  │
│  │  Watchers    │ │ Registry  │ │ REST / SSE / WS endpoints│  │
│  │  (chokidar)  │ │ (sessions)│ │  POST /api/agent/:type     │  │
│  └──────────────┘ └────────────┘ └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Agent Adapter Pattern

Every agent has a different interface (CLI flags, output format, session management). Heaveneye normalizes all of them through the `AgentAdapter` interface defined in `server/adapters/types.ts`:

```typescript
export interface AgentAdapter {
  type: 'claude-code' | 'antigravity' | 'hermes';
  spawn(prompt: string, cwd: string): Promise<string>;   // → sessionId
  stream(sessionId: string): AsyncIterable<AgentEvent>;
  send(sessionId: string, message: string): Promise<void>;
  status(sessionId: string): AgentStatus;
  kill(sessionId: string): Promise<void>;
}

export interface AgentEvent {
  type: 'text' | 'tool_use' | 'status' | 'result' | 'error';
  sessionId: string;
  data: unknown;
  ts: number;
}
```

The adapter layer means the frontend never needs to know which agent it's talking to — all agents look identical through the unified interface.

### Session Management

`server/adapters/registry.ts` maintains a `Map<sessionId, AdapterSession>` tracking all active sessions across all adapters. The registry exposes:
- `register(adapterType, sessionId)` — track new session
- `unregister(sessionId)` — clean up completed session
- `getSession(sessionId)` — retrieve session metadata
- `listSessions()` — all active sessions

### Event Flow

**Spawning an agent:**
1. Frontend calls `POST /api/agent/:type/spawn` with `{ prompt, cwd }`
2. Backend picks the appropriate adapter (by `:type`) and calls `adapter.spawn(prompt, cwd)`
3. Adapter starts the CLI process and returns a `sessionId`
4. Registry tracks the new session
5. SSE stream opens at `/api/sessions/:sessionId/stream`
6. Frontend receives `system/init` event with session metadata

**Monitoring an agent:**
1. File watchers (chokidar) monitor agent output files:
   - Hermes → `~/.hermes/events/*.jsonl`
   - Claude Code → transcript files (auto-detected)
   - Antigravity → `~/.gemini/antigravity-cli/conversations/*.pb`
2. Events are parsed and normalized to `AgentEvent` shape
3. SSE pushes events to all subscribed frontend clients

**Sending a message (interactive session):**
1. Frontend sends `WS /ws/agent` message `{ type: "send", sessionId, message }`
2. Backend routes to appropriate adapter's `send()` method
3. Adapter writes to the agent's input mechanism (stdin, inbox file, etc.)
4. Response flows back through the SSE stream

## Key Files

| File | Purpose |
|------|---------|
| `server/adapters/types.ts` | `AgentAdapter` interface + `AgentEvent`/`AgentStatus` types |
| `server/adapters/registry.ts` | Session registry, tracks all active sessions |
| `server/adapters/claudeCode.ts` | Claude Code adapter (JSONL stream parsing) |
| `server/adapters/antigravity.ts` | Antigravity CLI adapter (plain text output) |
| `server/adapters/hermes.ts` | Hermes adapter (kanban API + watcher events) |
| `server/adapters/wsAgent.ts` | WebSocket endpoint for bidirectional agent commands |
| `server/watchers/` | Chokidar file watchers for each agent's output format |
| `server/state/` | In-memory state (agents, sessions, kanban tasks) |
| `web/src/store/` | Zustand store with persistence layer |

## Adding a New Agent Adapter

See [ADAPTER_GUIDE.md](ADAPTER_GUIDE.md) for step-by-step instructions.

## Technology Choices

- **Bun** — chosen for fast spawn of child processes and native WebSocket support
- **Hono** — lightweight REST framework, works well with Bun's HTTP server
- **SSE** — server-sent events for one-way real-time streaming (watchers → frontend)
- **WebSocket** — bidirectional for interactive commands (send/receive within a session)
- **xterm.js** — terminal emulation for displaying raw stdout from agent CLIs
- **Zustand** — lightweight state management for real-time UI updates
- **Tailwind 4** — utility-first CSS with custom design tokens
- **Motion** — spring-based animations for layout transitions and micro-interactions