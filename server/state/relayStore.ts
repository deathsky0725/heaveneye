/**
 * relayStore.ts — tracks relay state per agent.
 *
 * Relay = a kanban task completing. When an agent completes a task on any board,
 * we record the timestamp (lastRelayTime) and increment relayCount for that day.
 * The HM2-REPORT automation polls /api/agent/:id/relay-status to know when
 * to auto-subscribe and send a Discord notification.
 */

import { AGENT_IDS, type AgentId } from '../config.ts';

export interface RelayStatus {
  hasPendingReport: boolean;
  lastRelayTime: string | null;   // ISO string
  relayCount: number;             // how many times relayed today
}

class RelayStore {
  /** When each agent last fired a relay (completed a task) */
  private lastRelayAt = new Map<AgentId, number>();

  /** Daily relay counts, keyed by YYYY-MM-DD */
  private relayCounts = new Map<AgentId, Map<string, number>>();

  /** Reports in flight: taskId → true while waiting to be acknowledged */
  private pendingReports = new Set<string>();

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  /**
   * Called by kanban watcher when an agent completes a task.
   * Records the relay timestamp and bumps the daily count.
   */
  onRelayFired(agentId: AgentId, taskId: string): void {
    const now = Date.now();
    this.lastRelayAt.set(agentId, now);
    const today = this.todayKey();
    const counts = this.relayCounts.get(agentId) ?? new Map();
    counts.set(today, (counts.get(today) ?? 0) + 1);
    this.relayCounts.set(agentId, counts);
    this.pendingReports.add(taskId);
  }

  /**
   * Called by the report subscriber when a report has been sent/dispatched.
   * Clears the pending flag for that task.
   */
  acknowledgeReport(taskId: string): void {
    this.pendingReports.delete(taskId);
  }

  /** Get current relay status for an agent */
  getStatus(agentId: AgentId): RelayStatus {
    const lastRelayMs = this.lastRelayAt.get(agentId) ?? null;
    const today = this.todayKey();
    const counts = this.relayCounts.get(agentId) ?? new Map();
    const relayCount = counts.get(today) ?? 0;

    return {
      hasPendingReport: this.pendingReports.size > 0,
      lastRelayTime: lastRelayMs !== null ? new Date(lastRelayMs).toISOString() : null,
      relayCount,
    };
  }
}

export const relayStore = new RelayStore();