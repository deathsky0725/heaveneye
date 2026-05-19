import { useState, useEffect } from 'react';
import type { AgentSnapshot, AgentStatus } from '../types';
import { RiveAvatar } from './RiveAvatar';
import { TokenBadge } from './TokenBadge';
import { StatChart } from './StatChart';
import { idleDuration, IDLE_COLOR, alertDuration, ALERT_COLOR } from '../lib/idle';
import { useStore } from '../store';

type TimelineDotType = 'token_usage' | 'session_start' | 'session_end' | 'kanban_event' | 'other';

interface TimelineEntry {
  type: string;
  ts: string;
  tokens?: { model: string; input: number; output: number; cacheRead: number; cacheCreate: number };
}

const DOT_COLOR: Record<TimelineDotType, string> = {
  token_usage:   'bg-blue-400',
  session_start: 'bg-green-400',
  session_end:   'bg-green-400',
  kanban_event:  'bg-amber-400',
  other:         'bg-slate-400',
};

const DOT_LABEL: Record<TimelineDotType, string> = {
  token_usage:   'token',
  session_start: 'session',
  session_end:   'session',
  kanban_event:  'kanban',
  other:         'other',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle:     'ว่าง',
  thinking: 'กำลังคิด',
  working:  'กำลังทำงาน',
  done:     'เสร็จแล้ว',
  failed:   'ล้มเหลว',
  blocked:  '🛡 รอ review',
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle:     'bg-slate-500',
  thinking: 'bg-amber-400 animate-pulse',
  working:  'bg-emerald-400 animate-pulse',
  done:     'bg-cyan-400',
  failed:   'bg-rose-500',
  blocked:  'bg-amber-400',
};

export function AgentCard({ agent, compact = false }: { agent: AgentSnapshot; compact?: boolean }) {
  const [showHistory, setShowHistory] = useState(false);
  const [timelineDots, setTimelineDots] = useState<{ color: string; label: string }[]>([]);
  const [relayPending, setRelayPending] = useState(false);
  const [lastRelayAgo, setLastRelayAgo] = useState<string | null>(null);
  const openDetailPanel = useStore((s) => s.openDetailPanel);

  useEffect(() => {
    // Fetch timeline dots
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/agent/${agent.id}/timeline?limit=30`)
      .then((r) => r.json())
      .then((data: { timeline?: TimelineEntry[] }) => {
        const events = data.timeline ?? [];
        // API returns newest first; reverse so oldest is leftmost
        const reversed = [...events].reverse();
        const dots = reversed.slice(0, 8).map((ev: TimelineEntry): { color: string; label: string } => {
          switch (ev.type) {
            case 'token_usage':   return { color: 'bg-blue-400',   label: 'token' };
            case 'session_start': return { color: 'bg-green-400',  label: 'session' };
            case 'session_end':   return { color: 'bg-green-400', label: 'session' };
            case 'kanban_event':  return { color: 'bg-amber-400',  label: 'kanban' };
            default:              return { color: 'bg-slate-400', label: 'other' };
          }
        });
        // Pad blank dots to fill 8 slots
        while (dots.length < 8) {
          dots.push({ color: 'bg-transparent', label: '' });
        }
        setTimelineDots(dots);
      })
      .catch(() => {});

    // Fetch relay status
    fetch(`${base}/api/agent/${agent.id}/relay-status`)
      .then((r) => r.json())
      .then((d: { hasPendingReport: boolean; lastRelayTime: string | null }) => {
        setRelayPending(d.hasPendingReport);
        if (d.lastRelayTime) {
          const diff = Date.now() - new Date(d.lastRelayTime).getTime();
          const m = Math.floor(diff / 60000);
          if (m < 60) setLastRelayAgo(`${m}m ago`);
          else {
            const h = Math.floor(m / 60);
            setLastRelayAgo(`${h}h ago`);
          }
        } else {
          setLastRelayAgo(null);
        }
      })
      .catch(() => {});
  }, [agent.id]);

  return (
    <div
      data-agent-id={agent.id}
      className={`rounded-2xl backdrop-blur-sm bg-white/5 border border-white/10 hover:border-white/20 transition cursor-pointer ${agent.status === 'blocked' ? 'border-l-4 border-amber-400' : ''} ${compact ? 'p-3' : 'p-5'}`}
      style={{ boxShadow: agent.status !== 'idle' ? `0 0 24px -8px ${agent.color}` : undefined }}
      onClick={() => openDetailPanel(agent.id)}
    >
      <div className="flex items-start gap-3">
        <RiveAvatar id={agent.id} status={agent.status} color={agent.color} size={compact ? 'sm' : 'md'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate" style={{ color: agent.color }}>{agent.name}</h2>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0">{agent.team}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {agent.role}
            {agent.currentModel && (
              <span className="ml-1 text-slate-500">· {agent.currentModel}</span>
            )}
          </p>

          <div className="flex gap-0.5 mt-2">
            {timelineDots.map((dot, idx) => (
              <span
                key={idx}
                className={`w-1.5 h-1.5 rounded-full ${dot.color}`}
                title={dot.label}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
            <span className="text-sm text-slate-200">{STATUS_LABEL[agent.status]}</span>
            {relayPending && (
              <span className="ml-1 text-[10px] rounded px-1.5 py-0.5 bg-amber-400/15 text-amber-400 border border-amber-400/20">
                ● HM2 รอ relay
              </span>
            )}
            {!relayPending && lastRelayAgo && (
              <span className="ml-1 text-[10px] text-slate-600">
                relay {lastRelayAgo}
              </span>
            )}
          </div>

          {/* Alert banner — working/think agents inactive > 5 min */}
          {(agent.status === 'working' || agent.status === 'thinking') && (() => {
            const alert = alertDuration(agent.lastEventAt);
            return alert.tier !== 'hidden' ? (
              <div
                className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 ${alert.tier === 'alert' ? 'bg-amber-400/10 border border-amber-400/20' : alert.tier === 'stall' ? 'bg-orange-400/10 border border-orange-400/20' : 'bg-rose-500/10 border border-rose-500/20 animate-pulse'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={`text-xs font-medium ${ALERT_COLOR[alert.tier]}`}>
                  {alert.text}
                </span>
                {(alert.tier === 'stall' || alert.tier === 'stuck') && (
                  <button
                    data-testid={`kill-btn-${agent.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Kill ${agent.name} worker?`)) {
                        useStore.getState().killAgent(agent.id);
                      }
                    }}
                    className="text-xs rounded px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 transition-colors"
                  >
                    kill
                  </button>
                )}
              </div>
            ) : null;
          })()}
          {agent.status === 'idle' && (() => {
            const idle = idleDuration(agent.lastEventAt, !!agent.currentTask);
            return idle.tier !== 'hidden' ? (
              <div className={`text-[11px] ${IDLE_COLOR[idle.tier]} mt-0.5`}>
                {idle.text}
              </div>
            ) : null;
          })()}

          {agent.currentTask && (
            <div className="mt-1 text-xs text-slate-300 truncate">
              {agent.currentBoard && (
                <span
                  className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium mr-1"
                  style={{ backgroundColor: `${agent.color}22`, color: agent.color }}
                >
                  {agent.currentBoard}
                </span>
              )}
              <span className="text-slate-500">↳</span> {agent.currentTask.title ?? agent.currentTask.id}
            </div>
          )}
          {agent.blockReason && (
            <div className="mt-1 text-xs text-amber-300 line-clamp-2">
              <span className="text-slate-500">⏸</span> {agent.blockReason}
            </div>
          )}
          {agent.lastTool && (
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">tool: {agent.lastTool}</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <TokenBadge usage={agent.tokensToday} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowHistory((v) => !v);
          }}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors ml-2"
        >
          📊 history
        </button>
      </div>

      {showHistory && (
        <div className="mt-2 overflow-hidden rounded-lg">
          <StatChart agentId={agent.id} compact={compact} />
        </div>
      )}
    </div>
  );
}