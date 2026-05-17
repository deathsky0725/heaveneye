import { useEffect, useRef, useState } from 'react';
import type { TokenUsage } from '../types';

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
};

export function TokenBadge({ usage }: { usage: TokenUsage }) {
  const total = usage.input + usage.output + usage.cacheRead + usage.cacheCreate;
  const prev = useRef(total);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (total > prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = total;
      return () => clearTimeout(t);
    }
    prev.current = total;
  }, [total]);

  return (
    <div className="text-xs grid grid-cols-2 gap-x-3 gap-y-1 text-slate-300 mt-2">
      <div className={`col-span-2 font-mono text-sm transition-all duration-700 ${flash ? 'text-amber-200 drop-shadow-[0_0_6px_rgba(252,211,77,0.8)]' : 'text-slate-100'}`}>
        {fmt(total)} <span className="text-slate-400 text-[10px]">tokens</span>
      </div>
      <div>↓ in <span className="font-mono text-slate-200">{fmt(usage.input)}</span></div>
      <div>↑ out <span className="font-mono text-slate-200">{fmt(usage.output)}</span></div>
      <div>⚡ cache <span className="font-mono text-slate-200">{fmt(usage.cacheRead)}</span></div>
      <div>✨ create <span className="font-mono text-slate-200">{fmt(usage.cacheCreate)}</span></div>
    </div>
  );
}
