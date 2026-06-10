import { AnimatePresence, motion } from 'motion/react';
import { useToastStore, type ToastItem } from '../store/toastStore';

const typeStyles: Record<ToastItem['type'], { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-500/90',
    border: 'border-emerald-400/40',
    icon: '✓',
  },
  error: {
    bg: 'bg-rose-500/90',
    border: 'border-rose-400/40',
    icon: '✕',
  },
  info: {
    bg: 'bg-blue-500/90',
    border: 'border-blue-400/40',
    icon: 'ℹ',
  },
  warning: {
    bg: 'bg-amber-500/90',
    border: 'border-amber-400/40',
    icon: '⚠',
  },
};

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastRow({ toast, onDismiss }: ToastProps) {
  const styles = typeStyles[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl
        glass-overlay border border-white/10 shadow-lg shadow-black/20
        min-w-[280px] max-w-[360px]
        ${styles.bg}
      `}
    >
      {/* Icon */}
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-white text-sm font-bold">
        {styles.icon}
      </span>

      {/* Message */}
      <span className="flex-1 text-white text-sm font-medium leading-snug">
        {toast.message}
      </span>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-white/60 hover:text-white transition-colors text-lg leading-none"
      >
        ×
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastRow toast={toast} onDismiss={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}