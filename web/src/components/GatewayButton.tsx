import { useState } from 'react';
import { useStore } from '../store';
import { useToastStore } from '../store/toastStore';

interface GatewayButtonProps {
  profile: string;
}

export function GatewayButton({ profile }: GatewayButtonProps) {
  const health = useStore((s) => s.systemHealth);
  const [loading, setLoading] = useState(false);

  const gateway = health?.gateways.find((g) => g.profile === profile);
  const alive = gateway?.alive ?? false;
  // Gateway has never connected — no entry in health.gateways means it has
  // never registered. Disable both Start and Stop since there's nothing to control.
  const neverRegistered = !gateway;

  const handleStart = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/gateway/${profile}/start`, { method: 'POST' });
      const data = await res.json() as { ok: boolean; pid?: number };
      if (data.ok) {
        useToastStore.getState().addToast(`Gateway started (PID ${data.pid ?? '?'})`, 'success');
      } else {
        useToastStore.getState().addToast('Failed to start gateway', 'error');
      }
    } catch {
      useToastStore.getState().addToast('Failed to reach server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (loading) return;
    if (!confirm(`Stop gateway for ${profile}?`)) return;
    setLoading(true);
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/gateway/${profile}/stop`, { method: 'POST' });
      const data = await res.json() as { ok: boolean };
      if (data.ok) {
        useToastStore.getState().addToast('Gateway stopped', 'success');
      } else {
        useToastStore.getState().addToast('Failed to stop gateway', 'error');
      }
    } catch {
      useToastStore.getState().addToast('Failed to reach server', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${alive ? 'bg-emerald-400' : 'bg-rose-500'}`}
        title={alive ? 'running' : 'stopped'}
      />
      <button
        onClick={alive ? handleStop : handleStart}
        disabled={loading || neverRegistered}
        className={`text-[10px] px-2 py-0.5 rounded transition flex items-center gap-1 ${
          loading
            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
            : neverRegistered
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : alive
            ? 'bg-rose-900/50 text-rose-300 hover:bg-rose-800/60 cursor-pointer'
            : 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/60 cursor-pointer'
        }`}
        title={neverRegistered ? 'Gateway has never connected — no control available' : alive ? 'Stop gateway' : 'Start gateway'}
      >
        {loading ? '...' : neverRegistered ? '—' : alive ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}