import type { AgentStatus } from '../types';

// Phase 1 placeholder: emoji + CSS animation.
// Phase 1.7 will swap this with @rive-app/react-canvas
const EMOJI: Record<string, string> = {
  ziyue: '🎀',
  anmaioyi: '📐',
  wenshu: '✍️',
  yanxin: '🎨',
  jianfeng: '🎬',
};

const animClass = (s: AgentStatus) => {
  switch (s) {
    case 'working':  return 'anim-wiggle';
    case 'thinking': return 'anim-breathe';
    case 'done':     return 'anim-bounce';
    case 'failed':   return '';
    default:         return 'anim-breathe';
  }
};

export function RiveAvatar({ id, status, color, size = 'md' }: { id: string; status: AgentStatus; color: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-16 h-16 text-4xl' : 'w-24 h-24 text-5xl';
  return (
    <div
      className={`${dim} rounded-2xl flex items-center justify-center shadow-lg`}
      style={{ background: `linear-gradient(135deg, ${color}55, ${color}22)`, border: `1px solid ${color}66` }}
    >
      <div className={`${animClass(status)}`} style={{ filter: status === 'idle' ? 'grayscale(0.5)' : 'none' }}>
        {EMOJI[id] ?? '👤'}
      </div>
    </div>
  );
}
