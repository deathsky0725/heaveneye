import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { AgentStatus } from '../types';

// ── Animation class map ──────────────────────────────────────────────────────
const STATUS_ANIM: Record<AgentStatus, string> = {
  idle:     'anim-idle',
  thinking: 'anim-breathe',
  working:  'anim-wiggle',
  done:     'anim-sparkle',
  failed:   'anim-error-flash',
  blocked:  'anim-pulse-amber',
};

const DIM_CLASS = {
  sm: 'w-11 h-11 text-xl',
  md: 'w-16 h-16 text-3xl',
} as const;

export type ActivityEvent = 'message' | 'task_done' | 'error';

interface RiveAvatarProps {
  id: string;
  status: AgentStatus;
  color: string;
  size?: 'sm' | 'md';
  /** Fire an activity event to trigger a burst animation */
  activityEvent?: ActivityEvent | null;
}

const AGENT_EMOJI: Record<string, string> = {
  ziyue:    '👩‍💼', // Ziyue - เลขาส่วนตัว
  anmaioyi: '👩‍✈️', // Anmaioyi - Lead
  wenshu:   '👨‍🎓', // Wenshu - Writer / SEO
  yanxin:   '🧑‍🎨', // Yanxin - Designer
  jianfeng: '🧑‍🎬', // Jianfeng - Editor
  shihao:   '👨‍💻', // Shihao - Frontend
  yefan:    '🧑‍💻', // Yefan - Backend
};

// ── Activity burst overlays ────────────────────────────────────────────────────
function RippleBurst({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{
        background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl animate-[ripple-burst_0.6s_ease-out_forwards]"
        style={{ border: `2px solid ${color}99` }}
      />
    </div>
  );
}

function SparkleBurst({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 6px 2px ${color}`,
            top: '50%',
            left: '50%',
            animation: `sparkle-particle-${i} 0.6s ease-out forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes sparkle-particle-0 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(-30px,-40px) scale(0); opacity: 0; }
        }
        @keyframes sparkle-particle-1 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(30px,-40px) scale(0); opacity: 0; }
        }
        @keyframes sparkle-particle-2 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(-40px,10px) scale(0); opacity: 0; }
        }
        @keyframes sparkle-particle-3 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(40px,10px) scale(0); opacity: 0; }
        }
        @keyframes sparkle-particle-4 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(-20px,40px) scale(0); opacity: 0; }
        }
        @keyframes sparkle-particle-5 {
          0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(20px,40px) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ErrorFlash({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none animate-[error-flash_0.5s_ease-out_forwards]"
      style={{
        boxShadow: `0 0 0 0 ${color}`,
        border: `2px solid #ef4444`,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RiveAvatar({
  id,
  status,
  color,
  size = 'md',
  activityEvent,
}: RiveAvatarProps) {
  const emoji = AGENT_EMOJI[id] ?? '👤';
  const dim   = DIM_CLASS[size];
  const [burst, setBurst] = useState<ActivityEvent | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React to activity events
  useEffect(() => {
    if (!activityEvent) return;
    setBurst(activityEvent);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurst(null), 700);
    return () => {
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, [activityEvent]);

  const animClass = STATUS_ANIM[status] ?? 'anim-idle';
  const isBlocked = status === 'blocked';

  return (
    <motion.div
      className={`${dim} rounded-2xl flex items-center justify-center relative`}
      animate={burst === 'message' ? { scale: [1, 1.05, 1] } : undefined}
      transition={{ duration: 0.3 }}
      style={{
        background: `linear-gradient(135deg, ${color}55, ${color}22)`,
        border:   `1px solid ${color}66`,
        boxShadow: isBlocked
          ? `0 0 0 3px ${color}44, 0 0 20px -4px #f59e0b`
          : undefined,
      }}
    >
      {/* Activity burst overlays */}
      <AnimatePresence>
        {burst === 'message' && <RippleBurst key="ripple" color={color} />}
        {burst === 'task_done' && <SparkleBurst key="sparkle" color={color} />}
        {burst === 'error' && <ErrorFlash key="error" color={color} />}
      </AnimatePresence>

      {/* Amber pulse ring for blocked state */}
      {isBlocked && (
        <div
          className="absolute inset-0 rounded-2xl animate-ping opacity-30"
          style={{ boxShadow: `0 0 0 3px #f59e0b` }}
        />
      )}

      {/* Emoji with color-matched drop shadow */}
      <motion.div
        className={animClass}
        animate={
          status === 'done' && burst === 'task_done'
            ? { scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }
            : undefined
        }
        transition={{ duration: 0.5 }}
        style={{
          filter: status === 'idle' ? 'grayscale(0.4)' : `drop-shadow(0 0 6px ${color}99)`,
        }}
      >
        {emoji}
      </motion.div>
    </motion.div>
  );
}