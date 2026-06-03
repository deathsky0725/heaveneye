import { useState } from 'react';
import { useStore } from '../store';
import { useToastStore } from '../store/toastStore';

type Range = 'today' | '7d' | '30d' | 'custom';
type Format = 'csv' | 'json';
type ExportType = 'all' | 'token_usage' | 'kanban_events' | 'notifications';

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'custom', label: 'Custom' },
];

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
];

const TYPE_OPTIONS: { value: ExportType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'token_usage', label: 'Token Usage' },
  { value: 'kanban_events', label: 'Kanban Events' },
  { value: 'notifications', label: 'Notifications' },
];

function buildExportUrl(range: Range, format: Format, type: ExportType, from?: string, to?: string): string {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  const params = new URLSearchParams({ range, format, type });
  if (range === 'custom') {
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  return `${base}/api/export?${params.toString()}`;
}

function downloadBlob(url: string, filename: string) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    });
}

export function ExportPanel() {
  const [range, setRange] = useState<Range>('7d');
  const [format, setFormat] = useState<Format>('csv');
  const [type, setType] = useState<ExportType>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToastStore((s) => s.addToast);

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = buildExportUrl(range, format, type, customFrom, customTo);
      const ext = format === 'csv' ? 'csv' : 'json';
      const typeSlug = type === 'all' ? 'heaveneye-export' : type;
      const rangeSlug = range === 'custom' ? 'custom' : range;
      const filename = `${typeSlug}-${rangeSlug}.${ext}`;
      await downloadBlob(url, filename);
      toast(`Exported ${filename}`, 'success');
      setOpen(false);
    } catch {
      toast('Export failed — check server connection', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
        title="Export data"
      >
        <span>📥</span>
        <span>Export</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-4 w-72">
          <div className="text-xs font-semibold text-slate-200 mb-3">📥 Export Data</div>

          {/* Type */}
          <label className="block text-xs text-slate-400 mb-1">Data</label>
          <div className="flex flex-wrap gap-1 mb-3">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setType(o.value)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  type === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Range */}
          <label className="block text-xs text-slate-400 mb-1">Time Range</label>
          <div className="flex flex-wrap gap-1 mb-3">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setRange(o.value)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  range === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          {range === 'custom' && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-0.5">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-0.5">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Format */}
          <label className="block text-xs text-slate-400 mb-1">Format</label>
          <div className="flex gap-1 mb-4">
            {FORMAT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setFormat(o.value)}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  format === o.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs py-2 rounded transition-colors flex items-center justify-center gap-2"
          >
            {exporting ? 'Exporting...' : '⬇️ Download'}
          </button>
        </div>
      )}
    </div>
  );
}