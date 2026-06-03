# Tauri 2.0 Setup for Heaveneye

## Prerequisites

### Rust toolchain (required)
```bash
# Install rustup
brew install rustup-init

# After install, add to PATH (add to ~/.zshrc)
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"

# Install stable toolchain
rustup install stable
rustup default stable

# Verify
cargo --version
# → cargo 1.95.0 or newer
```

### Tauri CLI (required)
```bash
npm install -g @tauri-apps/cli@latest

# Verify
npx tauri --version
```

## Setup

From the `heaveneye/` project root (where `package.json` lives):

```bash
# 1. Install frontend deps (if not already done)
bun install

# 2. Verify Rust compiles (this downloads Tauri deps)
cd src-tauri
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
cargo check
cd ..

# 3. Return to project root
cd ..
```

## Running in Dev Mode

### Option A: Full Tauri dev (native window)
```bash
bun run dev:tauri
```
This starts:
- Vite dev server (http://localhost:5173) in the background
- Tauri native window with Heaveneye

### Option B: Web-only (no native)
```bash
bun run dev
```

## Features Enabled

| Feature | Implementation |
|---|---|
| System tray icon | Left-click tray → show/focus window |
| Tray context menu | Show / Hide / Quit |
| Global shortcut | `Ctrl+Shift+H` toggles window visibility |
| Native window | 1200×800 default, 800×600 min |
| Notifications | Via `tauri-plugin-notification` (needs permission) |
| Close-to-tray | Closing the window hides it (app keeps running) |

## Notes

- `devtools: true` is set in `tauri.conf.json` — remove for production builds
- The app identifier is `com.heaveneye.app`
- Tray icon uses the default Tauri app icon from `src-tauri/icons/`
- Global shortcut works even when the app is in the background

## Troubleshooting

**`cargo: command not found`**
→ Run `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` or add to `~/.zshrc`

**Notification permission denied on macOS**
→ System Preferences → Security & Privacy → Notifications → allow your terminal app

**Global shortcut not working**
→ Tauri requires notification permission to be granted first for global shortcuts on macOS