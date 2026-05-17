import { useEffect, useRef } from 'react';
import { connectStream, startUsage5hPolling, useStore } from './store';
import { AgentCard } from './components/AgentCard';
import { ConnectionLines } from './components/ConnectionLines';
import { UsagePanel } from './components/UsagePanel';
import { InboxPanel } from './components/InboxPanel';
import type { AgentId, AgentSnapshot } from './types';

export default function App() {
  const agents = useStore((s) => s.agents);
  const connected = useStore((s) => s.connected);
  const orgRef = useRef<HTMLDivElement>(null);

  useEffect(() => { connectStream(); startUsage5hPolling(); }, []);

  const byId = (id: AgentId): AgentSnapshot | undefined => agents.find((a) => a.id === id);

  return (
    <>
      <div className="min-h-full p-6 max-w-screen-2xl mx-auto">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <span>👁️</span> heaveneye
              </h1>
              <p className="text-xs text-slate-400">ตาสวรรค์ — มองเห็นทุกการเคลื่อนไหวของทีม</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 ml-4">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              {connected ? 'connected' : 'disconnected'}
            </div>
          </div>
          <div className="min-w-0">
            <UsagePanel />
          </div>
        </header>

        {agents.length === 0 ? (
          <div className="text-center text-slate-500 py-20">รอเชื่อมต่อ server...</div>
        ) : (
          <div ref={orgRef} className="relative grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-x-12 gap-y-8 items-start">
            <ConnectionLines agents={agents} containerRef={orgRef} />
            {/* Left: จื่อเยว่ */}
            <div className="flex items-center justify-center lg:min-h-[420px]">
              {byId('ziyue') && <div className="w-full max-w-sm"><AgentCard agent={byId('ziyue')!} /></div>}
            </div>

            {/* Right: เมี่ยวอี + ลูกทีม */}
            <div className="flex flex-col gap-8 min-w-0">
              <div className="flex justify-center">
                {byId('anmaioyi') && <div className="w-full max-w-sm"><AgentCard agent={byId('anmaioyi')!} /></div>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {(['wenshu','yanxin','jianfeng','shihao','yefan'] as const).map((id) => {
                  const a = byId(id);
                  return a ? <AgentCard key={id} agent={a} compact /> : null;
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      <InboxPanel />
    </>
  );
}