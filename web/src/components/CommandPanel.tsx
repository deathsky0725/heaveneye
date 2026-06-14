import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useToastStore } from '../store/toastStore';
import { VoiceSTT } from './VoiceSTT';

interface CommandPanelProps {
  onClose: () => void;
}

// Quick-action command templates
const QUICK_ACTIONS = [
  { label: 'Phase A start', command: 'Phase A start' },
  { label: 'Phase B start', command: 'Phase B start' },
  { label: 'review', command: 'review' },
  { label: 'status check', command: 'status check' },
];

async function postCommand(text: string): Promise<void> {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  const res = await fetch(`${base}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function CommandPanel({ onClose }: CommandPanelProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Auto-focus on mount
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });

      if (res.ok) {
        useToastStore.getState().addToast('ส่งไปที่ ji-ziyue แล้ว รอ ji-ziyue ack', 'success');
        setText('');
        onClose();
      } else {
        useToastStore.getState().addToast('ส่งคำสั่งไม่สำเร็จ', 'error');
      }
    } catch {
      useToastStore.getState().addToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (command: string) => {
    try {
      await postCommand(command);
      useToastStore.getState().addToast(`ส่ง "${command}" แล้ว`, 'success');
      onClose();
    } catch {
      useToastStore.getState().addToast('ส่งคำสั่งไม่สำเร็จ', 'error');
    }
  };

  return prefersReducedMotion ? (
    // Static — no animation
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md mx-4 glass-overlay rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌉</span>
            <span className="text-slate-100 text-sm font-medium">Bridge Command</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none">×</button>
        </div>
        {/* Quick-action pills */}
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {QUICK_ACTIONS.map(({ label, command }) => (
            <button
              key={command}
              onClick={() => handleQuickAction(command)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-slate-100 transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="พิมพ์คำสั่ง…"
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 text-sm outline-none focus:border-white/25 transition-colors disabled:opacity-50"
          />
          <VoiceSTT
            onResult={(t) => setText((prev) => (prev ? prev + ' ' + t : t))}
            className="text-base"
          />
          <button
            type="submit"
            disabled={!text.trim() || loading}
            className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
          >
            {loading ? '…' : 'ส่ง'}
          </button>
        </form>
        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="bg-white/5 px-1.5 py-0.5 rounded">ESC</span> close
          </span>
        </div>
      </div>
    </div>
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-full max-w-md mx-4 glass-overlay rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌉</span>
            <span className="text-slate-100 text-sm font-medium">Bridge Command</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Quick-action pills */}
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {QUICK_ACTIONS.map(({ label, command }) => (
            <button
              key={command}
              onClick={() => handleQuickAction(command)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-slate-100 transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="พิมพ์คำสั่ง…"
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 text-sm outline-none focus:border-white/25 transition-colors disabled:opacity-50"
          />
          <VoiceSTT
            onResult={(t) => setText((prev) => (prev ? prev + ' ' + t : t))}
            className="text-base"
          />
          <button
            type="submit"
            disabled={!text.trim() || loading}
            className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
          >
            {loading ? '…' : 'ส่ง'}
          </button>
        </form>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="bg-white/5 px-1.5 py-0.5 rounded">ESC</span> close
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
