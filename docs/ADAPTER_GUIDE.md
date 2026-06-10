# Implementing a New Agent Adapter

This guide walks you through adding support for a new AI coding agent to Heaveneye.

## Overview

Adapters normalize different agent interfaces into a single `AgentAdapter` interface. The frontend only ever talks to adapters — it doesn't need to know which agent is running.

## Interface Definition

All adapters must implement `server/adapters/types.ts`:

```typescript
export interface AgentAdapter {
  type: string;  // e.g. 'claude-code', 'antigravity', 'hermes'
  spawn(prompt: string, cwd: string): Promise<string>;   // returns sessionId
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

export interface AgentStatus {
  sessionId: string;
  state: 'spawning' | 'running' | 'idle' | 'done' | 'error';
  costUsd?: number;
  model?: string;
}
```

## Step-by-Step Implementation

### Step 1 — Create the adapter file

Create `server/adapters/<agentName>.ts`:

```typescript
import type { AgentAdapter, AgentEvent, AgentStatus } from './types.js';

export function createAgentAdapter(): AgentAdapter {
  let sessions = new Map<string, ChildProcess>();

  return {
    type: 'my-agent',

    async spawn(prompt: string, cwd: string): Promise<string> {
      const sessionId = crypto.randomUUID();
      const child = spawn('my-agent', ['-p', prompt], { cwd });
      sessions.set(sessionId, child);
      return sessionId;
    },

    async *stream(sessionId: string): AsyncIterable<AgentEvent> {
      const child = sessions.get(sessionId);
      if (!child) throw new Error(`Session ${sessionId} not found`);

      for await (const chunk of child.stdout) {
        yield { type: 'text', sessionId, data: chunk, ts: Date.now() };
      }
    },

    async send(sessionId: string, message: string): Promise<void> {
      const child = sessions.get(sessionId);
      if (child) child.stdin.write(message + '\n');
    },

    async status(sessionId: string): AgentStatus {
      const child = sessions.get(sessionId);
      return {
        sessionId,
        state: child ? 'running' : 'done',
      };
    },

    async kill(sessionId: string): Promise<void> {
      sessions.get(sessionId)?.kill();
      sessions.delete(sessionId);
    },
  };
}
```

### Step 2 — Register the adapter

In `server/adapters/index.ts`:

```typescript
import { createMyAgentAdapter } from './myAgent.js';

const adapters = {
  'claude-code': createClaudeCodeAdapter(),
  'antigravity': createAntigravityAdapter(),
  'hermes': createHermesAdapter(),
  'my-agent': createMyAgentAdapter(),   // ← add here
};

export { adapters };
```

### Step 3 — Wire REST endpoints

In `server/index.ts`, add the spawn endpoint if it doesn't already route generically:

```typescript
// POST /api/agent/:type/spawn
// Routes to adapter.spawn() based on :type param
```

### Step 4 — Add file watcher (optional, for monitoring)

If your agent writes output to a file, add a watcher in `server/watchers/`:

```typescript
import { watch } from 'chokidar';

export function watchMyAgentEvents(callback: (event: AgentEvent) => void) {
  return watch(['~/.my-agent/**/*.log'], {
    persistent: true,
    ignoreInitial: true,
  }).on('change', (path) => {
    // parse file, emit events
    callback(parseLine(readFile(path)));
  });
}
```

### Step 5 — Test the adapter

```bash
# Test spawn
curl -X POST http://localhost:7878/api/agent/my-agent/spawn \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "cwd": "/tmp"}'

# Test stream (SSE)
curl http://localhost:7878/api/sessions/<sessionId>/stream

# Test kill
curl -X POST http://localhost:7878/api/sessions/<sessionId>/kill
```

## Output Format Handling

Different agents output differently — adapter must normalize:

| Agent | Output format | How to normalize |
|-------|--------------|-------------------|
| Claude Code | JSONL (one JSON object per line) | Parse each line as JSON → `AgentEvent` |
| Antigravity (agy) | Plain text | Treat each stdout chunk as `text` event |
| Hermes | Watcher events (JSONL) | Already structured — pass through directly |

Your adapter should handle partial chunks (JSONL spanning multiple reads) by maintaining a buffer and only emitting complete lines.

## Key Patterns

### Spawn with working directory

```typescript
const child = spawn('agent-cli', ['-p', prompt, '--cwd', cwd], {
  cwd,
  env: { ...process.env, AGENT_CWD: cwd },
});
```

### Capturing session ID from agent output

Claude Code emits `session_id` in the first `system/init` event:

```typescript
let capturedSessionId: string | null = null;
for await (const line of child.stdout) {
  const event = JSON.parse(line);
  if (event.session_id) capturedSessionId = event.session_id;
  yield { type: 'status', sessionId: capturedSessionId!, data: event, ts: Date.now() };
}
```

### Graceful shutdown

```typescript
async kill(sessionId: string) {
  const child = sessions.get(sessionId);
  if (!child) return;

  child.kill('SIGTERM');
  await new Promise(r => child.on('exit', r));
  sessions.delete(sessionId);
}
```

## Checklist

- [ ] Implements all 5 `AgentAdapter` methods
- [ ] Handles missing/invalid sessionId gracefully
- [ ] Cleans up processes on `kill()`
- [ ] Normalizes output to `AgentEvent` shape
- [ ] Registered in `server/adapters/index.ts`
- [ ] Works with existing watchers / SSE stream
- [ ] `bun tsc --noEmit` passes