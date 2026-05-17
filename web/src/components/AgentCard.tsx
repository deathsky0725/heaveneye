import type { AgentSnapshot, AgentStatus } from '../types';
import { RiveAvatar } from './RiveAvatar';
import { TokenBadge } from './TokenBadge';

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
  return (
    <div
      data-agent-id={agent.id}
      className={`rounded-2xl backdrop-blur-sm bg-white/5 border border-white/10 hover:border-white/20 transition ${agent.status === 'blocked' ? 'border-l-4 border-amber-400' : ''} ${compact ? 'p-3' : 'p-5'}`}
      style={{ boxShadow: agent.status !== 'idle' ? `0 0 24px -8px ${agent.color}` : undefined }}
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

          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
            <span className="text-sm text-slate-200">{STATUS_LABEL[agent.status]}</span>
          </div>

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

      <TokenBadge usage={agent.tokensToday} />
    </div>
  );
}
