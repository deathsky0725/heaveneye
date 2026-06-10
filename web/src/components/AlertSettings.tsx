import { useState, useEffect } from 'react';
import { useToastStore } from '../store/toastStore';

export interface AlertConfig {
  enabled: boolean;
  thresholds: {
    ramBytes: number;
    blockedTaskAgeMs: number;
    inactivityTimeoutMs: number;
    burnRateLimitTokensPerMin: number;
  };
}

const RAM_OPTIONS = [
  { label: '1 GB', bytes: 1 * 1024 * 1024 * 1024 },
  { label: '2 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { label: '4 GB', bytes: 4 * 1024 * 1024 * 1024 },
  { label: '8 GB', bytes: 8 * 1024 * 1024 * 1024 },
  { label: '16 GB', bytes: 16 * 1024 * 1024 * 1024 },
];

const BLOCKED_TASK_AGE_OPTIONS = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hr', ms: 60 * 60 * 1000 },
  { label: '2 hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4 hr', ms: 4 * 60 * 60 * 1000 },
];

const INACTIVITY_OPTIONS = [
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hr', ms: 60 * 60 * 1000 },
];

const BURN_RATE_OPTIONS = [
  { label: '10k tokens/min', tokens: 10000 },
  { label: '25k tokens/min', tokens: 25000 },
  { label: '50k tokens/min', tokens: 50000 },
  { label: '100k tokens/min', tokens: 100000 },
  { label: '200k tokens/min', tokens: 200000 },
];

function SelectOption({ value, options, onChange }: { value: number; options: Array<{ label: string; bytes: number } | { label: string; ms: number } | { label: string; tokens: number }>; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.label} value={'bytes' in o ? o.bytes : ('ms' in o ? o.ms : o.tokens)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function AlertSettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const toast = useToastStore((s) => s.addToast);

  const [enabled, setEnabled] = useState(true);
  const [ramBytes, setRamBytes] = useState(2 * 1024 * 1024 * 1024);
  const [blockedTaskAgeMs, setBlockedTaskAgeMs] = useState(30 * 60 * 1000);
  const [inactivityTimeoutMs, setInactivityTimeoutMs] = useState(10 * 60 * 1000);
  const [burnRateLimitTokensPerMin, setBurnRateLimitTokensPerMin] = useState(50000);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current config on mount
  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/config/alerts`)
      .then((res) => (res.ok ? res.json() as Promise<AlertConfig> : null))
      .then((data) => {
        if (data) {
          setEnabled(data.enabled);
          setRamBytes(data.thresholds.ramBytes);
          setBlockedTaskAgeMs(data.thresholds.blockedTaskAgeMs);
          setInactivityTimeoutMs(data.thresholds.inactivityTimeoutMs);
          setBurnRateLimitTokensPerMin(data.thresholds.burnRateLimitTokensPerMin ?? 50000);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/config/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          thresholds: { ramBytes, blockedTaskAgeMs, inactivityTimeoutMs, burnRateLimitTokensPerMin },
        }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) {
        toast(result.error ?? 'Save failed', 'error');
      } else {
        toast('Alert settings saved', 'success');
        onClose();
      }
    } catch {
      toast('Failed to reach server', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-lg border border-slate-600 p-5 w-[420px] max-w-[90vw] shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-slate-200">🔔 Alert Thresholds</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400 py-8 text-center">Loading...</div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Global enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  enabled ? 'bg-indigo-600' : 'bg-slate-600'
                }`}
                onClick={() => setEnabled((v) => !v)}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-sm text-slate-200">Enable alert monitoring</span>
            </label>

            <div className="h-px bg-slate-700" />

            {/* RAM threshold */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">RAM threshold</label>
              <SelectOption
                value={ramBytes}
                options={RAM_OPTIONS}
                onChange={setRamBytes}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Alert when system RAM usage exceeds this limit
              </p>
            </div>

            {/* Blocked task age */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Blocked task age</label>
              <SelectOption
                value={blockedTaskAgeMs}
                options={BLOCKED_TASK_AGE_OPTIONS}
                onChange={setBlockedTaskAgeMs}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Alert when a blocked task exceeds this age
              </p>
            </div>

            {/* Inactivity timeout */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Inactivity timeout</label>
              <SelectOption
                value={inactivityTimeoutMs}
                options={INACTIVITY_OPTIONS}
                onChange={setInactivityTimeoutMs}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Alert when an agent has no events beyond this duration
              </p>
            </div>

            {/* Token burn rate */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Token burn rate alert</label>
              <SelectOption
                value={burnRateLimitTokensPerMin}
                options={BURN_RATE_OPTIONS}
                onChange={setBurnRateLimitTokensPerMin}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Alert when an agent consumes API tokens faster than this rate
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs py-2 rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}