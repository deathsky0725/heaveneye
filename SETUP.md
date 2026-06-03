# Heaveneye Setup Guide

This guide provides detailed setup instructions to run and configure Heaveneye in development and production environments.

## 1. System Prerequisites

Before running Heaveneye, ensure you have the following installed on your machine:
- **Bun**: `curl -fsSL https://bun.sh/install | sh`
- **Rust (for Tauri App)**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Homebrew (Alternative macOS Rust)**: `brew install rust`

## 2. Agent CLIs Prerequisites

Heaveneye connects to active agent sessions via local command-line tools. You must have these CLI tools installed and authenticated:

- **Claude Code**:
  - Install: `npm install -g @anthropic-ai/claude-code`
  - Authenticate: `claude` (complete first-run authentication flow)
- **Antigravity CLI**:
  - Install: download `agy` executable binary to your path.
  - Authenticate: `agy login` (Google OAuth login)
- **Hermes Gateway**:
  - Configured profiles located under `~/.hermes/profiles/`.

## 3. Local Development

1. **Install node modules**:
   ```bash
   bun install
   ```
2. **Environment Variables**:
   Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Modify keys like `DISCORD_WEBHOOK_URL` if you want automatic alerts sent to your Discord channels.

3. **Start Servers**:
   ```bash
   bun run dev
   ```
   This command starts:
   - **Hono Backend**: listening on `http://localhost:7878`
   - **Vite Web Frontend**: listening on `http://localhost:5173`

Open `http://localhost:5173` in your browser.

## 4. Tauri Native Application Setup

Tauri wraps the web frontend as a native window and gives it system capabilities.

1. **Start Dev Loop**:
   ```bash
   bunx tauri dev
   ```
   This will run Vite and launch a native window connecting to the local server port.

2. **Build Production Application**:
   ```bash
   bunx tauri build
   ```
   The compiled macOS `.app` bundle will be generated under `src-tauri/target/release/bundle/macos/`.

## 5. Troubleshooting

### Port Already in Use

If you see `EADDRINUSE: address already in use :::7878`:
```bash
lsof -i :7878
kill <PID>
# Or start on a different port:
HEAVENEYE_PORT=7879 bun run dev
```

### Agent CLI Not Found

Ensure each agent CLI is installed and in your PATH:

| Agent | Install Command | Verify |
|-------|----------------|--------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `which claude` |
| Antigravity | Download from antigravity.google | `which agy` |
| Hermes | Part of Hermes installation | `which hermes` |

If installed but not detected, set explicit paths in `.env`:
```
CLAUDE_BIN=/opt/homebrew/bin/claude
AGY_BIN=/Users/ben/.local/bin/agy
```

### API Key Errors

If agents fail with `401 Unauthorized`, verify your `.env` has valid keys:
- **Anthropic**: https://console.anthropic.com/settings/keys
- **OpenAI**: https://platform.openai.com/api-keys
- **Google**: https://aistudio.google.com/app/apikey
- **MiniMax**: https://platform.minimax.io/

### Tauri Build Fails

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# On macOS
brew install rust

# Update Tauri dependencies
cd src-tauri && cargo update
```

### Discord Webhook Not Working

1. Get your webhook URL from Discord: Channel Settings → Integrations → Webhooks
2. Set `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...` in `.env`
3. Restart the dev server

For more issues, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
