/**
 * Compute idle duration tier from agent's lastEventAt.
 * Used by AgentCard to display "ว่าง Nm" label with severity color.
 */

export type IdleTier = 'hidden' | 'normal' | 'warning' | 'critical';

export interface IdleInfo {
  minutes: number;
  tier: IdleTier;
  text: string;     // e.g. "ว่าง 12m" or "ว่าง 45m · มี task รอ"
}

/**
 * For idle agents: normal idle tracking.
 */
export function idleDuration(
  lastEventAt: string | undefined,
  hasPendingTask: boolean,
  now: number = Date.now()
): IdleInfo {
  if (!lastEventAt) return { minutes: 0, tier: 'hidden', text: '' };

  const ms = now - new Date(lastEventAt).getTime();
  const minutes = Math.floor(ms / 60_000);

  if (minutes < 5) return { minutes, tier: 'hidden', text: '' };

  const taskSuffix = hasPendingTask ? ' · มี task รอ' : '';

  if (minutes < 30) {
    return { minutes, tier: 'normal', text: `ว่าง ${minutes}m${taskSuffix}` };
  }
  if (minutes < 60) {
    return { minutes, tier: hasPendingTask ? 'warning' : 'normal', text: `ว่าง ${minutes}m${taskSuffix}` };
  }
  return { minutes, tier: 'critical', text: `ว่าง ${minutes}m${taskSuffix}` };
}

export const IDLE_COLOR: Record<IdleTier, string> = {
  hidden:   '',
  normal:   'text-slate-500',
  warning:  'text-amber-400',
  critical: 'text-rose-400',
};

/** Alert tier for working/think agents — 3 levels based on minutes idle */
export type AlertTier = 'hidden' | 'alert' | 'stall' | 'stuck';

export interface AlertInfo {
  minutes: number;
  tier: AlertTier;
  text: string; // e.g. "💤 idle 7m" / "⚠️ stall? 14m" / "🔴 likely stuck 25m — kill?"
}

/**
 * For working/think agents: inactivity alert tiers.
 * Returns hidden when status is not working/thinking or idle < 5 min.
 */
export function alertDuration(
  lastEventAt: string | undefined,
  now: number = Date.now()
): AlertInfo {
  if (!lastEventAt) return { minutes: 0, tier: 'hidden', text: '' };

  const ms = now - new Date(lastEventAt).getTime();
  const minutes = Math.floor(ms / 60_000);

  if (minutes < 5) return { minutes, tier: 'hidden', text: '' };

  if (minutes < 10) {
    return { minutes, tier: 'alert', text: `💤 idle ${minutes}m` };
  }
  if (minutes < 20) {
    return { minutes, tier: 'stall', text: `⚠️ stall? ${minutes}m` };
  }
  return { minutes, tier: 'stuck', text: `🔴 likely stuck ${minutes}m — kill?` };
}

export const ALERT_COLOR: Record<AlertTier, string> = {
  hidden: '',
  alert:  'text-amber-400',
  stall:  'text-orange-400',
  stuck:  'text-rose-400 animate-pulse',
};
