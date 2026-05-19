/**
 * relayCron.ts — HM2-REPORT automation: polls relay status and fires Discord
 * notifications when an agent fires a relay (completes a task).
 *
 * Polling pattern: same as system-health watcher — interval-based, per-agent.
 * Discord notification: uses the existing dispatchNotification pattern via
 * state.onNotificationEntry() which flows into DiscordPanel.
 */

import { AGENT_IDS, AGENTS, type AgentId } from '../config.ts';
import { relayStore } from '../state/relayStore.ts';
import { state } from '../state/engine.ts';

const POLL_INTERVAL_MS = 30_000; // match system-health cadence

/**
 * Per-agent last-seen relay count — used to detect new relays.
 * Only counts today (daily reset handled by relayStore itself).
 */
const lastRelayCount = new Map<AgentId, number>();

export async function startRelayCron(): Promise<() => void> {
  console.log('[relay-cron] starting (poll every', POLL_INTERVAL_MS / 1000, 's)');

  const poll = async () => {
    for (const id of AGENT_IDS) {
      try {
        const status = relayStore.getStatus(id);
        const prev = lastRelayCount.get(id) ?? 0;

        // New relay fired: send Discord notification
        if (status.relayCount > prev) {
          lastRelayCount.set(id, status.relayCount);
          const agentName = AGENTS[id]?.name ?? id;
          const lastTime = status.lastRelayTime
            ? new Date(status.lastRelayTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
            : 'unknown';
          const msg = `🔔 **${agentName}** ทำงานเสร็จแล้ว (${status.relayCount} งานวันนี้ · ล่าสุด ${lastTime})`;
          state.onNotificationEntry({
            ts: new Date().toISOString(),
            platform: 'discord',
            chat_id: 'relay-cron', // virtual channel — DiscordPanel reads this
            task_id: 'relay-cron',
            task_title: undefined,
            event_kind: 'relay_fired',
            agent: id,
            message: msg,
          });
          console.log(`[relay-cron] ${agentName} relay fired (count=${status.relayCount})`);
        }
      } catch (e) {
        console.warn(`[relay-cron] poll error for ${id}:`, e);
      }
    }
  };

  // Seed initial counts so we don't fire for existing relay state
  for (const id of AGENT_IDS) {
    lastRelayCount.set(id, relayStore.getStatus(id).relayCount);
  }

  // initial poll
  await poll();

  const timer = setInterval(poll, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}