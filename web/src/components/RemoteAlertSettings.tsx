import { useState, useEffect, useCallback } from 'react';
import { useToastStore } from '../store/toastStore';

const STORAGE_KEY = 'heaveneye_alert_settings';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RemoteAlertConfig {
  // Per-event-type × per-channel toggles
  toggles: {
    cap80Discord: boolean;
    cap80Tauri: boolean;
    cap90Discord: boolean;
    cap90Tauri: boolean;
    stuckDiscord: boolean;
    stuckTauri: boolean;
    parkedDiscord: boolean;
    parkedTauri: boolean;
  };
  thresholds: {
    capPercent: number; // 80 | 90
    stuckMinutes: number;
  };
}

const DEFAULT_CONFIG: RemoteAlertConfig = {
  toggles: {
    cap80Discord: true,
    cap80Tauri: false,
    cap90Discord: true,
    cap90Tauri: false,
    stuckDiscord: true,
    stuckTauri: false,
    parkedDiscord: true,
    parkedTauri: false,
  },
  thresholds: {
    capPercent: 80,
    stuckMinutes: 25,
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  reducedMotion,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  reducedMotion: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full relative transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-slate-600'
      }`}
      style={reducedMotion ? { transition: 'none' } : undefined}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
        style={reducedMotion ? { transition: 'none' } : undefined}
      />
    </button>
  );
}

function ChannelGroup({
  label,
  eventType,
  checkedDiscord,
  checkedTauri,
  onChangeDiscord,
  onChangeTauri,
  reducedMotion,
}: {
  label: string;
  eventType: string;
  checkedDiscord: boolean;
  checkedTauri: boolean;
  onChangeDiscord: (v: boolean) => void;
  onChangeTauri: (v: boolean) => void;
  reducedMotion: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-slate-200">{label}</span>
        <span className="text-[10px] text-slate-500">{eventType}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 w-10 text-right">Discord</span>
          <Toggle
            checked={checkedDiscord}
            onChange={onChangeDiscord}
            reducedMotion={reducedMotion}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 w-10 text-right">Tauri</span>
          <Toggle
            checked={checkedTauri}
            onChange={onChangeTauri}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RemoteAlertSettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const toast = useToastStore((s) => s.addToast);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [config, setConfig] = useState<RemoteAlertConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<RemoteAlertConfig>;
        setConfig({
          toggles: { ...DEFAULT_CONFIG.toggles, ...parsed.toggles },
          thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
        });
      }
    } catch {
      /* ignore parse errors */
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(
    async (next: RemoteAlertConfig) => {
      setConfig(next);
      // Persist to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // POST to backend
      setSaving(true);
      try {
        const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
        const res = await fetch(`${base}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        const result = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || !result.ok) {
          toast(result.error ?? 'Save failed', 'error');
        }
      } catch {
        toast('Failed to reach server', 'error');
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  const setToggle = (key: keyof RemoteAlertConfig['toggles'], value: boolean) => {
    save({ ...config, toggles: { ...config.toggles, [key]: value } });
  };

  const setCapPercent = (v: number) => {
    save({ ...config, thresholds: { ...config.thresholds, capPercent: v } });
  };

  const setStuckMinutes = (v: number) => {
    save({ ...config, thresholds: { ...config.thresholds, stuckMinutes: v } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-800 rounded-lg border border-slate-600 p-5 w-[480px] max-w-[90vw] shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-slate-200">🔔 Remote Alert Settings</h2>
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
          <div className="flex flex-col gap-5">
            {/* Section: Event type toggles */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Alert Channels
              </h3>
              <div className="bg-slate-900 rounded border border-slate-700 px-4">
                <ChannelGroup
                  label="5h Cap Near"
                  eventType="5h quota ≥ cap%"
                  checkedDiscord={config.toggles.cap80Discord}
                  checkedTauri={config.toggles.cap80Tauri}
                  onChangeDiscord={(v) => setToggle('cap80Discord', v)}
                  onChangeTauri={(v) => setToggle('cap80Tauri', v)}
                  reducedMotion={reducedMotion}
                />
                <ChannelGroup
                  label="Weekly Cap Near"
                  eventType="weekly quota ≥ cap%"
                  checkedDiscord={config.toggles.cap90Discord}
                  checkedTauri={config.toggles.cap90Tauri}
                  onChangeDiscord={(v) => setToggle('cap90Discord', v)}
                  onChangeTauri={(v) => setToggle('cap90Tauri', v)}
                  reducedMotion={reducedMotion}
                />
                <ChannelGroup
                  label="Stuck Agent"
                  eventType="no heartbeat > stuck-min"
                  checkedDiscord={config.toggles.stuckDiscord}
                  checkedTauri={config.toggles.stuckTauri}
                  onChangeDiscord={(v) => setToggle('stuckDiscord', v)}
                  onChangeTauri={(v) => setToggle('stuckTauri', v)}
                  reducedMotion={reducedMotion}
                />
                <ChannelGroup
                  label="Parked Card"
                  eventType="card in [PARKED]"
                  checkedDiscord={config.toggles.parkedDiscord}
                  checkedTauri={config.toggles.parkedTauri}
                  onChangeDiscord={(v) => setToggle('parkedDiscord', v)}
                  onChangeTauri={(v) => setToggle('parkedTauri', v)}
                  reducedMotion={reducedMotion}
                />
              </div>
            </div>

            {/* Section: Thresholds */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Thresholds
              </h3>
              <div className="bg-slate-900 rounded border border-slate-700 px-4 py-3 flex flex-col gap-4">
                {/* Cap % slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-300">Cap %</label>
                    <span className="text-xs font-mono text-indigo-400">{config.thresholds.capPercent}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={70}
                      max={100}
                      step={10}
                      value={config.thresholds.capPercent}
                      onChange={(e) => setCapPercent(Number(e.target.value))}
                      className="flex-1 accent-indigo-500"
                    />
                    <div className="flex gap-1">
                      {[80, 90].map((stop) => (
                        <button
                          key={stop}
                          onClick={() => setCapPercent(stop)}
                          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                            config.thresholds.capPercent === stop
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                          style={reducedMotion ? { transition: 'none' } : undefined}
                        >
                          {stop}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stuck minutes input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="stuck-min" className="text-xs text-slate-300">
                      Stuck agent threshold
                    </label>
                    <span className="text-xs font-mono text-indigo-400">
                      {config.thresholds.stuckMinutes} min
                    </span>
                  </div>
                  <input
                    id="stuck-min"
                    type="number"
                    min={5}
                    max={300}
                    value={config.thresholds.stuckMinutes}
                    onChange={(e) => setStuckMinutes(Math.max(5, Math.min(300, Number(e.target.value))))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Alert when an agent has no heartbeat beyond this many minutes
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
