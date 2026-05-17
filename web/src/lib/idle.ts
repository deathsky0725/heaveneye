/**
 * Compute idle duration tier from agent's lastEventAt.
 * Used by AgentCard to display "ว่ามา Nm" label with severity color.
 */

export type IdleTier = 'hidden' | 'normal' | 'warning' | 'critical';

export interface IdleInfo {
  minutes: number;
  tier: IdleTier;
  text: string;     // e.g. "ว่าง 12m" or "ว่าง 45m · มี task รอ"
}

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
