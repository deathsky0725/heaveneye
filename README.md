# 👁️ Heaveneye — Unified Agentic Workspace

> **Real-time mission control for AI coding agents.** Chat, terminal output, and process monitoring — unified in one premium interface.

[![CI](https://github.com/username/heaveneye/actions/workflows/ci.yml/badge.svg)](https://github.com/username/heaveneye/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🎯 What is Heaveneye?

Heaveneye is a unified developer workspace that connects to multiple AI coding agents simultaneously — giving you a single place to spawn, monitor, and interact with all of them.

**Supported agents:**
- 🤖 **Claude Code** — Anthropic's official CLI agent
- 🚀 **Antigravity CLI** (`agy`) — Google's headless coding agent
- 🛡️ **Hermes** — Nous Research's multi-agent orchestration system

## 📸 Screenshots

> Screenshots coming soon — [contribute a screenshot](https://github.com/username/heaveneye/issues)!

```
┌─────────────────────────────────────────────────────────────┐
│  Heaveneye UI Preview                                       │
│  [AgentCards] [ChatPane] [TerminalPane — xterm.js]          │
└─────────────────────────────────────────────────────────────┘
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Zustand + Tailwind 4 + Motion + xterm.js) │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────────┐│
│  │ AgentCards  │ │ ChatPane     │ │ TerminalPane (xterm.js) ││
│  └──────┬──────┘ └──────┬──────┘ └────────────┬──────────────┘│
└─────────┼────────────────┼────────────────────┼─────────────────┘
          │ SSE (events)   │ WebSocket (cmds)  │ SSE (streams)
┌─────────┴────────────────┴────────────────────┴─────────────────┐
│  Backend (Bun + Hono) — Agent Orchestration Layer              │
│  ┌────────────────────────────────────────────────────────────┐│
│  │  AgentAdapter interface (unified abstraction)             ││
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐  ││
│  │  │ ClaudeCode │  │ Antigravity  │  │ Hermes            │  ││
│  │  └────────────┘  └──────────────┘  └───────────────────┘  ││
│  └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

For full architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## ⚡ Quick Start

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | sh
```

### 2. Clone and install

```bash
git clone https://github.com/username/heaveneye.git
cd heaveneye
bun install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys and preferences
```

### 4. Start the dev servers

```bash
bun run dev:server   # Hono backend on http://localhost:7878
bun run dev:web      # Vite frontend on http://localhost:5173
```

Or start both at once:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Install agent CLI prerequisites

Heaveneye needs the agent CLIs installed and authenticated on your system:

| Agent | Install | Authenticate |
|-------|---------|--------------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude` (first-run OAuth) |
| Antigravity | Download from antigravity.google | `agy login` |
| Hermes | See [Hermes docs](https://hermes-agent.nousresearch.com) | Profile setup |

For detailed setup, see [SETUP.md](SETUP.md).

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS 4, Zustand, Motion, @xterm/xterm |
| **Backend** | Bun, Hono (REST + WebSockets + SSE) |
| **Desktop** | Tauri 2.0 (Rust) |
| **Agents** | Claude Code, Antigravity CLI (agy), Hermes |

## 📖 Documentation

- [Setup Guide](SETUP.md) — Full installation instructions
- [Architecture](docs/ARCHITECTURE.md) — System design and patterns
- [Adapter Guide](docs/ADAPTER_GUIDE.md) — How to add a new agent adapter
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and solutions
- [Agent CLI Reference](docs/agent-cli-reference.md) — Verified CLI flags and output formats

## 🔧 Development

```bash
# Type check
bun tsc --noEmit

# Build frontend
bun run build

# Run tests
bun test
```

## 📄 License

MIT License — see [LICENSE](LICENSE).

---

Built for [พี่เบญ](https://github.com/username) and the Heaveneye team.