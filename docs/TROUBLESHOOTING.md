# Heaveneye Troubleshooting Guide

## Common Issues

---

### "Port 7878 already in use"

**Symptom:** Backend fails to start with `EADDRINUSE: address already in use :::7878`

**Cause:** Another process is using port 7878.

**Fix:**
```bash
# Find what's using port 7878
lsof -i :7878

# Kill it (replace <PID> with the process ID)
kill <PID>

# Or use a different port
HEAVENEYE_PORT=7879 bun run dev
```

---

### "Port 5173 already in use"

**Symptom:** Vite frontend fails to start.

**Fix:**
```bash
# Find and kill the process on port 5173
lsof -i :5173
kill <PID>

# Or use a different port (edit vite.config.ts)
```

---

### Agent CLI not found

**Symptom:** `claude: command not found` or `agy: command not found`

**Fix — Claude Code:**
```bash
npm install -g @anthropic-ai/claude-code
claude  # Run once to authenticate
```

**Fix — Antigravity (agy):**
```bash
# Download from https://antigravity.google
# Move to your PATH
chmod +x agy
sudo mv agy /usr/local/bin/agy

# Authenticate
agy login
```

**Fix — Hermes:**
```bash
# Ensure Hermes is in your PATH
which hermes
# If not found, add to PATH or set HERMES_BIN in .env
```

---

### DISCORD_WEBHOOK_URL is missing or invalid

**Symptom:** Discord notifications fail silently.

**Fix:** Edit `.env` and set a valid Discord webhook URL:
```bash
# Get webhook URL from Discord:
# Channel Settings → Integrations → Webhooks → Copy Webhook URL
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
```

---

### Provider API key errors

**Symptom:** Agent spawn fails with `401 Unauthorized` or `API key not valid`

**Fix:** Ensure your `.env` has the correct API key:
```bash
# Check current .env
cat .env | grep API_KEY

# Update with correct key
# - ANTHROPIC_API_KEY from https://console.anthropic.com/settings/keys
# - OPENAI_API_KEY from https://platform.openai.com/api-keys
# - GOOGLE_API_KEY from https://aistudio.google.com/app/apikey
```

---

### Tauri build fails

**Symptom:** `bunx tauri build` fails with Rust errors.

**Fix:**
```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Or on macOS
brew install rust

# Update Tauri dependencies
cd src-tauri && cargo update

# Verify Rust is working
rustc --version
cargo --version
```

---

### WebSocket connection fails

**Symptom:** `WebSocket connection to ws://localhost:7878/ws/agent failed`

**Fix:**
1. Verify backend is running: `curl http://localhost:7878/api/health`
2. Check that `server/adapters/wsAgent.ts` has no TypeScript errors: `bun tsc --noEmit`
3. Check browser console for CORS errors (if connecting from a different origin)

---

### xterm.js not rendering

**Symptom:** Terminal pane shows blank or only a cursor.

**Fix:**
```javascript
// Ensure the terminal is properly initialized
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const term = new Terminal();
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(domElement);
fitAddon.fit();  // Must call fit() after opening
```

---

### TypeScript errors after pulling latest

**Symptom:** `bun tsc --noEmit` fails with import errors.

**Fix:**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache

# Reinstall dependencies
bun install

# Run type check again
bun tsc --noEmit
```

---

### Hermes agent not spawning

**Symptom:** `POST /api/agent/hermes/spawn` returns 500 or times out.

**Fix:**
1. Verify Hermes is installed and in PATH: `which hermes`
2. Check `HERMES_HOME` is set correctly (default: `~/.hermes`)
3. Verify kanban DB exists: `ls ~/.hermes/kanban.db`
4. Check backend logs for the specific error message

---

### Session not streaming events

**Symptom:** SSE endpoint returns no events, page stays blank.

**Fix:**
1. Verify the agent process is actually running: `ps aux | grep claude`
2. Check that file watchers are watching the right paths
3. Try killing the session and respawning: `POST /api/sessions/:id/kill`
4. Check `.env` has correct `HERMES_HOME` and agent CLI paths

---

### First-run wizard doesn't detect agent CLIs

**Symptom:** Heaveneye UI shows agent CLIs as "not found" even though they're installed.

**Fix:**
```bash
# Verify CLI is in PATH
which claude   # should return a path
which agy      # should return a path

# If installed but not detected, set explicit paths in .env:
# CLAUDE_BIN=/opt/homebrew/bin/claude
# AGY_BIN=/Users/ben/.local/bin/agy

# Restart the backend server after updating .env
```

---

### Build succeeds but app looks broken

**Symptom:** `bun run build` passes but the app renders incorrectly.

**Fix:**
```bash
# Clear Vite cache
rm -rf node_modules/.vite
rm -rf web/dist

# Rebuild
bun run build

# Also check for mismatched dependencies
bun install
```

---

## Getting More Help

1. Check the [Heaveneye GitHub Issues](https://github.com/username/heaveneye/issues)
2. Review the full [Agent CLI Reference](agent-cli-reference.md) for agent-specific issues
3. Check `server/index.ts` and `server/adapters/` for recent changes that might affect your setup