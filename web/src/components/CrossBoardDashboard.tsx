import { useState, useEffect } from 'react';

interface BoardSummary {
  board: string;
  totalTasks: number;
  doneToday: number;
  blocked: number;
  avgCompletionMs: number | null;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(ms / 1000)}s`;
}

export function CrossBoardDashboard() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/boards`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ boards: BoardSummary[] }>;
      })
      .then((data) => {
        setBoards(data.boards);
        setLoading(false);
      })
      .catch(() => {
        setError('Cannot reach server');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="mb-4 rounded-lg bg-slate-900/60 border border-slate-700/50 p-3 text-xs text-slate-400">
        Loading boards…
      </div>
    );
  }

  if (error || boards.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg bg-slate-900/60 border border-slate-700/50 p-3 text-xs">
      <div className="text-slate-400 font-medium mb-3 flex items-center gap-2">
        <span>📋</span> Cross-Board Summary
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Header */}
          <div className="grid grid-cols-5 gap-2 text-slate-500 uppercase text-[10px] font-semibold mb-2 px-1">
            <span>Board</span>
            <span className="text-right">Total</span>
            <span className="text-right">Today</span>
            <span className="text-right">Blocked</span>
            <span className="text-right">Avg Time</span>
          </div>
          {/* Rows */}
          {boards.map((b) => (
            <div
              key={b.board}
              className="grid grid-cols-5 gap-2 items-center px-1 py-1.5 rounded hover:bg-slate-800/30 transition-colors"
            >
              <span className="text-slate-200 font-mono truncate" title={b.board}>
                {b.board}
              </span>
              <span className="text-right text-slate-300 font-mono">{b.totalTasks}</span>
              <span className="text-right text-emerald-300 font-mono">{b.doneToday}</span>
              <span className={`text-right font-mono ${b.blocked > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                {b.blocked}
              </span>
              <span className="text-right text-slate-400 font-mono">
                {formatDuration(b.avgCompletionMs)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}