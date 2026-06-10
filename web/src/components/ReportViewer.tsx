import { useState, useEffect } from 'react';
import { useStore } from '../store';

interface BoardSummary {
  board: string;
  totalTasks: number;
  doneToday: number;
  blocked: number;
  avgCompletionMs: number | null;
}

/** Minimal light-weight markdown renderer — no extra deps */
function renderMarkdown(src: string): string {
  return src
    // Headings
    .replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-4 mb-2 text-slate-200">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-4 mb-2 text-slate-100">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-6 mb-3 text-white">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-6 mb-4 text-white">$1</h1>')
    // Bold / italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-sm font-mono">$1</code>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del class="opacity-50">$1</del>')
    // Checklist done / not done
    .replace(/^- \[x\] (.+)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-emerald-400 shrink-0 mt-0.5">✓</span><span class="text-slate-300">$1</span></div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-slate-500 shrink-0 mt-0.5">○</span><span class="text-slate-400">$1</span></div>')
    // Unordered list
    .replace(/^[-*+] (.+)$/gm, '<li class="ml-4 text-slate-300 list-disc">$1</li>')
    // Ordered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-slate-300 list-decimal">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-slate-700 my-4" />')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-amber-500 pl-4 italic text-slate-400 my-2">$1</blockquote>')
    // Tables — basic two-pass (first row = header)
    .replace(/(<hr.*?\/])/g, '\n$1\n')
    // Paragraphs — split blank lines, wrap non-tag lines
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/<(h[1-6]|li|blockquote|hr|div|ul|ol)/.test(trimmed)) return trimmed;
      return `<p class="text-slate-300 leading-relaxed my-3">${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');
}

/** Check if content is JSONL (result.events.log) vs Markdown (result.md) */
function isJsonL(content: string): boolean {
  const lines = content.trim().split('\n');
  const nonCommentLine = lines.find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
  return nonCommentLine.startsWith('{') && nonCommentLine.includes('"timestamp"');
}

/** Render JSONL entries as a table of events */
function renderJsonL(content: string): string {
  const lines = content.trim().split('\n');
  const rows: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue; // skip empty / comment header
    try {
      const entry = JSON.parse(trimmed);
      const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }) : '';
      const agent = entry.agent ?? '';
      const event = entry.event ?? '';
      const taskTitle = entry.taskTitle ?? '';
      const taskId = entry.taskId ?? '';
      const extra = entry.extra ? `<div class="text-xs text-amber-400 mt-0.5 truncate">${entry.extra.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : '';

      const eventColor = event === 'completed' ? 'text-emerald-400' : event === 'blocked' ? 'text-rose-400' : event === 'unblocked' ? 'text-blue-400' : 'text-slate-400';

      rows.push(
        `<div class="flex items-start gap-3 py-2 border-b border-slate-800/50 last:border-0">` +
        `<span class="text-xs text-slate-500 shrink-0 w-36">${ts}</span>` +
        `<span class="shrink-0 text-xs font-mono text-slate-300 w-20">${agent}</span>` +
        `<span class="${eventColor} text-xs shrink-0 w-20 uppercase">${event}</span>` +
        `<div class="flex-1 min-w-0">` +
        `<div class="text-slate-200 text-xs truncate">${taskTitle}</div>` +
        `<div class="text-xs text-slate-500 font-mono">${taskId}</div>` +
        `${extra}` +
        `</div></div>`
      );
    } catch {
      // Skip unparseable lines
    }
  }

  if (rows.length === 0) {
    return '<div class="text-xs text-slate-500 py-4">No events logged</div>';
  }

  // Newest first — log file is appended chronologically (oldest at top),
  // so reverse to show the most recent event at the top.
  rows.reverse();

  return (
    `<div class="text-xs font-mono">` +
    `<div class="flex items-center gap-3 py-1.5 border-b border-slate-600 bg-slate-800/40 sticky top-0">` +
    `<span class="shrink-0 w-36 text-slate-400">Timestamp</span>` +
    `<span class="shrink-0 w-20 text-slate-400">Agent</span>` +
    `<span class="shrink-0 w-20 text-slate-400">Event</span>` +
    `<span class="flex-1 text-slate-400">Task</span>` +
    `</div>` +
    rows.join('') +
    `</div>`
  );
}

export function ReportViewer() {
  const [localBoards, setLocalBoards] = useState<BoardSummary[]>([]);
  const selectedBoard = useStore((s) => s.selectedBoard);
  const setSelectedBoard = useStore((s) => s.setSelectedBoard);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);

  // Load boards list for selector
  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/boards`)
      .then((res) => res.json() as Promise<{ boards: BoardSummary[] }>)
      .then((data) => {
        setLocalBoards(data.boards);
        if (data.boards.length > 0 && !data.boards.find((b) => b.board === selectedBoard)) {
          const firstBoard = data.boards[0];
          if (firstBoard) {
            setSelectedBoard(firstBoard.board);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Fetch report when board changes
  useEffect(() => {
    if (!selectedBoard) return;
    setBoardLoading(true);
    setError(null);
    setContent('');
    setLoading(true);

    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/reports/${encodeURIComponent(selectedBoard)}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error(`result.md not found for board "${selectedBoard}"`);
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<{ board: string; content: string }>;
      })
      .then((data) => {
        const rawContent = data.content;
        // Render JSONL events.log as a table, markdown result.md as-is
        const rendered = isJsonL(rawContent) ? renderJsonL(rawContent) : renderMarkdown(rawContent);
        setContent(rendered);
        setLoading(false);
        setBoardLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
        setBoardLoading(false);
      });
  }, [selectedBoard]);

  return (
    <div className="mb-4 rounded-lg bg-slate-900/60 border border-slate-700/50 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/40">
        <span className="text-slate-400 text-sm flex items-center gap-1.5">
          <span>📋</span> Reports
        </span>
        {localBoards.length > 0 && (
          <select
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
            className="ml-auto text-xs bg-slate-800 border border-slate-600 text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {localBoards.map((b) => (
              <option key={b.board} value={b.board}>
                {b.board}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content area */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        {boardLoading && (
          <div className="text-xs text-slate-400 py-6 text-center">Loading report…</div>
        )}
        {!boardLoading && error && (
          <div className="text-xs text-rose-400 py-4">{error}</div>
        )}
        {!boardLoading && !error && !content && (
          <div className="text-xs text-slate-500 py-4">No content</div>
        )}
        {!boardLoading && !error && content && (
          <div
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
}