/**
 * ProactiveHintBanner.tsx
 *
 * Renders active (non-dismissed) proactive hints as a dismissible amber banner
 * in the header area. Each hint can be individually dismissed so it won't
 * re-appear for the same breach.
 *
 * The banner only shows when there is at least one active hint — it does not
 * auto-dismiss like a toast, giving the user time to read and act.
 */

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useProactiveHintStore } from '../store/proactiveHintStore';

export function ProactiveHintBanner() {
  const hints = useProactiveHintStore((s) => s.hints);
  const dismissHint = useProactiveHintStore((s) => s.dismissHint);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const activeHints = hints.filter((h) => h.shown);

  return (
    <AnimatePresence>
      {activeHints.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, height: 'auto' }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          className="mx-6 mb-3"
        >
          <div className="flex flex-col gap-1.5">
            {activeHints.map((hint) => (
              <div
                key={hint.key}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 shadow-sm"
              >
                {/* Icon */}
                <span className="flex-shrink-0 text-amber-400 text-sm">
                  {hint.eventKind === 'blocked_task_age' && '👁️'}
                  {hint.eventKind === 'inactivity_timeout' && '⏰'}
                  {hint.eventKind === 'burn_rate_breach' && '🚨'}
                </span>

                {/* Message */}
                <span className="flex-1 text-amber-100 text-xs leading-snug">
                  {hint.message}
                </span>

                {/* Dismiss */}
                <button
                  onClick={() => dismissHint(hint.key)}
                  className="flex-shrink-0 text-amber-400/60 hover:text-amber-200 transition-colors text-lg leading-none"
                  title="ซ่อนและไม่แสดงอีก"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
