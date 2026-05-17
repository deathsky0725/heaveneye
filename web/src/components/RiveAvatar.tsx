import type { AgentStatus } from '../types';

// Agent-specific emoji (no generic fallback for shihao/yefan)
const AGENT_EMOJI: Record<string, string> = {
  ziyue:     '🎀',
  anmaioyi:  '📐',
  wenshu:    '✍️',
  yanxin:    '🎨',
  jianfeng:  '🎬',
  shihao:    '🛠️',   // tools — frontend dev identity
  yefan:     '⚡',    // lightning — backend dev energy
};

const animClass = (s: AgentStatus): string => {
  switch (s) {
    case 'working':  return 'anim-wiggle';
    case 'thinking': return 'anim-breathe';
    case 'done':     return 'anim-bounce';
    case 'blocked':   return 'anim-pulse-amber';
    default:         return 'anim-breathe';
  }
};

const DIM_CLASS = {
  sm: 'w-16 h-16 text-4xl',
  md: 'w-24 h-24 text-5xl',
} as const;

export function RiveAvatar({
  id, status, color, size = 'md',
}: {
  id: string;
  status: AgentStatus;
  color: string;
  size?: 'sm' | 'md';
}) {
  const emoji = AGENT_EMOJI[id] ?? '👤';
  const dim   = DIM_CLASS[size];
  const isBlocked = status === 'blocked';

  return (
    <div
      className={`${dim} rounded-2xl flex items-center justify-center relative`}
      style={{
        background: `linear-gradient(135deg, ${color}55, ${color}22)`,
        border:   `1px solid ${color}66`,
        boxShadow: isBlocked
          ? `0 0 0 3px ${color}44, 0 0 20px -4px #f59e0b`
          : undefined,
      }}
    >
      {/* Amber pulse ring for blocked state */}
      {isBlocked && (
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-30"
          style={{ boxShadow: `0 0 0 3px #f59e0b` }}
        />
      )}

      {/* Emoji with color-matched drop shadow */}
      <div
        className={animClass(status)}
        style={{
          filter: status === 'idle' ? 'grayscale(0.4)' : `drop-shadow(0 0 6px ${color}99)`,
        }}
      >
        {emoji}
      </div>
    </div>
  );
}