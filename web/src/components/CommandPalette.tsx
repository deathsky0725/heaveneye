import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { useToastStore } from '../store/toastStore';

interface Command {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: () => void | Promise<void>;
  danger?: boolean;
}

interface ConfirmState {
  command: Command;
  agentLabel?: string;
}

// ---- Fuse-like fuzzy match (no dep) ----
function fuzzy(test: string, pat: string): boolean {
  let ti = 0;
  for (let i = 0; i < pat.length; i++) {
    const p = pat[i]!.toLowerCase();
    const idx = test.indexOf(p, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function highlight(text: string, pat: string): React.ReactNode {
  if (!pat) return text;
  const lower = text.toLowerCase();
  const lp = pat.toLowerCase();
  const out: React.ReactNode[] = [];
  let prev = 0;
  let ti = 0;
  for (let i = 0; i < lp.length; i++) {
    const p = lp[i]!;
    const idx = lower.indexOf(p, ti);
    if (idx === -1) break;
    if (idx > prev) out.push(text.slice(prev, idx));
    out.push(<mark key={i} className="text-amber-400 font-semibold bg-transparent">{text[idx]}</mark>);
    prev = idx + 1;
    ti = idx + 1;
  }
  if (prev < text.length) out.push(text.slice(prev));
  return <>{out}</>;
}

export function CommandPalette() {
  const agents = useStore((s) => s.agents);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Keyboard shortcut ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirm(null);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---- Auto-focus input when opened ----
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setConfirm(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ---- Build commands ----
  const allCommands = useCallback((): Command[] => {
    const cmds: Command[] = [];

    // Kill agents
    for (const a of agents) {
      if (a.team === 'hermes') {
        cmds.push({
          id: `kill-${a.id}`,
          label: `kill ${a.id}`,
          description: `Kill worker for ${a.name} — SIGTERM → SIGKILL`,
          icon: '💀',
          danger: true,
          action: async () => {
            const result = await useStore.getState().killAgent(a.id);
            const toast = useToastStore.getState().addToast;
            if (result.killed) {
              toast(`Worker ${result.pid} killed`, 'success');
            } else {
              toast(`No active worker for ${a.name}`, 'warning');
            }
          },
        });
      }
    }

    // Restart gateway per profile
    const gatewayProfiles = ['anmaioyi', 'shihao', 'yefan', 'wenshu', 'yanxin', 'jianfeng'];
    for (const pid of gatewayProfiles) {
      cmds.push({
        id: `restart-gateway-${pid}`,
        label: `restart gateway ${pid}`,
        description: `Restart Hermes gateway for ${pid}`,
        icon: '🔄',
        action: async () => {
          const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
          const toast = useToastStore.getState().addToast;
          try {
            // Stop first
            const stopRes = await fetch(`${base}/api/gateway/${pid}/stop`, { method: 'POST' });
            const stopData = await stopRes.json() as { ok: boolean; error?: string };
            if (!stopData.ok && stopData.error !== 'forbidden') {
              toast(`Failed to stop gateway ${pid}: ${stopData.error}`, 'error');
              return;
            }
            // Give OS a moment to release the socket
            await new Promise<void>((r) => setTimeout(r, 1500));
            // Start
            const startRes = await fetch(`${base}/api/gateway/${pid}/start`, { method: 'POST' });
            const startData = await startRes.json() as { ok: boolean; pid?: number; error?: string };
            if (startData.ok) {
              toast(`Gateway ${pid} restarted (PID ${startData.pid})`, 'success');
            } else {
              toast(`Failed to start gateway ${pid}: ${startData.error}`, 'error');
            }
          } catch {
            toast(`Network error restarting gateway ${pid}`, 'error');
          }
        },
      });
    }

    // Export tokens — GET /api/agents then download as JSON
    cmds.push({
      id: 'export-tokens',
      label: 'export tokens',
      description: 'Download agent token usage as JSON',
      icon: '📤',
      action: async () => {
        const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
        try {
          const res = await fetch(`${base}/api/agents`);
          const data = await res.json() as { agents: typeof agents };
          const blob = new Blob([JSON.stringify(data.agents ?? [], null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `heaveneye-tokens-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          useToastStore.getState().addToast('Token export downloaded', 'success');
        } catch {
          useToastStore.getState().addToast('Failed to export tokens', 'error');
        }
      },
    });

    // Open board — navigate to kanban board
    cmds.push({
      id: 'open-board',
      label: 'open board',
      description: 'Open the Hermes Kanban board in a new tab',
      icon: '📋',
      action: async () => {
        const board = 'default';
        window.open(`http://localhost:5173/?board=${board}`, '_blank');
      },
    });

    return cmds;
  }, [agents]);

  const filtered = allCommands().filter(
    (c) => fuzzy(c.label, query) || fuzzy(c.description, query),
  );

  // ---- Arrow nav ----
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const executeCommand = async (cmd: Command) => {
    if (cmd.danger) {
      const agentLabel = cmd.label.replace('kill ', '');
      setConfirm({ command: cmd, agentLabel });
      return;
    }
    setOpen(false);
    setQuery('');
    setConfirm(null);
    await cmd.action();
  };

  const confirmExecute = async () => {
    if (!confirm) return;
    setOpen(false);
    setQuery('');
    setConfirm(null);
    await confirm.command.action();
  };

  // ---- Click backdrop to close ----
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
      setConfirm(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
          onClick={handleBackdropClick}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-full max-w-lg mx-4 glass-overlay rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <span className="text-lg">⌘</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command…"
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-base outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const cmd = filtered[activeIdx];
                    if (cmd) executeCommand(cmd);
                  }
                }}
              />
              <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded">ESC</span>
            </div>

            {/* Results */}
            {!confirm ? (
              <div className="max-h-72 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-5 py-6 text-center text-slate-500 text-sm">
                    No commands match "{query}"
                  </div>
                ) : (
                  filtered.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      onClick={() => executeCommand(cmd)}
                      className={`
                        w-full flex items-center gap-3 px-5 py-3 text-left transition-colors
                        ${i === activeIdx ? 'bg-white/10' : 'hover:bg-white/5'}
                      `}
                    >
                      <span className="text-lg flex-shrink-0">{cmd.icon}</span>
                      <span className="flex-1">
                        <span className="text-slate-100 text-sm font-medium block">
                          {highlight(cmd.label, query)}
                        </span>
                        <span className="text-slate-500 text-xs">{cmd.description}</span>
                      </span>
                      {cmd.danger && (
                        <span className="text-xs text-rose-400/70 bg-rose-500/10 px-2 py-0.5 rounded">
                          danger
                        </span>
                      )}
                      {i === activeIdx && (
                        <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded">↵</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Confirmation step */
              <div className="px-5 py-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-slate-100 text-sm font-medium">
                      Kill <span className="text-rose-400">{confirm.agentLabel}</span>?
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      This sends SIGTERM, waits 3s, then SIGKILL. The worker process will die.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setConfirm(null); setOpen(false); setQuery(''); }}
                    className="px-4 py-2 rounded-lg text-sm text-slate-400 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmExecute}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                  >
                    Kill — confirm
                  </button>
                </div>
              </div>
            )}

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span className="bg-white/5 px-1.5 py-0.5 rounded">↑↓</span> navigate
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-white/5 px-1.5 py-0.5 rounded">↵</span> execute
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-white/5 px-1.5 py-0.5 rounded">ESC</span> close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}