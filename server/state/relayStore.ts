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

  /** Reports in flight: agent → Set of taskIds pending acknowledgement */
  private pendingReports = new Map<AgentId, Set<string>>();

  private  todayKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }


  /**
   * Called by kanban watcher when an agent completes a task.
   * Records the relay timestamp and bumps the daily count.
   */
  onRelayFired(agentId: AgentId, taskId: string): void {
    console.log('[relayStore] relay fired: agent=' + agentId + ' task=' + taskId);
    const now = Date.now();
    this.lastRelayAt.set(agentId, now);
    const today = this.todayKey();
    const counts = this.relayCounts.get(agentId) ?? new Map();
    counts.set(today, (counts.get(today) ?? 0) + 1);
    this.relayCounts.set(agentId, counts);
    // Ensure pendingReports map has a Set for this agent, then add the taskId
    let reports = this.pendingReports.get(agentId);
    if (!reports) {
      reports = new Set<string>();
      this.pendingReports.set(agentId, reports);
    }
    reports.add(taskId);
  }

  /**
   * Called by the report subscriber when a report has been sent/dispatched.
   * Clears the pending flag for that task.
   */
  acknowledgeReport(taskId: string): void {
    // Remove the taskId from all agents' pending sets
    for (const [agent, reports] of this.pendingReports.entries()) {
      if (reports.delete(taskId)) {
        // If the set becomes empty, clean up the map entry
        if (reports.size === 0) {
          this.pendingReports.delete(agent);
        }
        // taskId is unique across agents, so we can break after deletion
        break;
      }
    }
  }

  /** Get current relay status for an agent */
  getStatus(agentId: AgentId): RelayStatus {
    const lastRelayMs = this.lastRelayAt.get(agentId) ?? null;
    const today = this.todayKey();
    const counts = this.relayCounts.get(agentId) ?? new Map();
    const relayCount = counts.get(today) ?? 0;

    return {
      hasPendingReport: (this.pendingReports.get(agentId)?.size ?? 0) > 0,
      lastRelayTime: lastRelayMs !== null ? new Date(lastRelayMs).toISOString() : null,
      relayCount,
    };
  }
}

export const relayStore = new RelayStore();