import { useEffect, lazy, Suspense, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { connectStream, startUsage5hPolling, fetchInitialInbox, fetchInitialEvents, fetchInitialHealth, useStore } from './store';
import { ChatPanel } from './components/ChatPanel';
import { useThemeStore, applyTheme } from './store/themeStore';
import { OfficeMap } from './components/OfficeMap';
import { UsagePanel } from './components/UsagePanel';
import { InboxPanel } from './components/InboxPanel';
import { TaskFeedSidebar } from './components/TaskFeedSidebar';
import { SystemHealth } from './components/SystemHealth';
import { CrossBoardDashboard } from './components/CrossBoardDashboard';
import { ReportViewer } from './components/ReportViewer';
import { ProviderPanel } from './components/ProviderPanel';
import { HealthStrip } from './components/HealthStrip';
import { ToastContainer } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { ExportPanel } from './components/ExportPanel';
import { CommandPalette } from './components/CommandPalette';
import { CommandPanel } from './components/CommandPanel';
import { VoiceTTS } from './components/VoiceTTS';
import { AlertSettings } from './components/AlertSettings';
import { ProactiveHintBanner } from './components/ProactiveHintBanner';
import { MissionControlPanel } from './components/MissionControlPanel';
import type { AgentId, AgentSnapshot, CrashNotificationEntry } from './types';

// DetailPanel is lazy-loaded — only opened on click
const LazyDetailPanel = lazy(() => import('./components/DetailPanel').then((m) => ({ default: m.DetailPanel })));
const LazyQuotaPanel = lazy(() => import('./components/QuotaPanel').then((m) => ({ default: m.QuotaPanel })));

export default function App() {
  const agents = useStore((s) => s.agents);
  const connected = useStore((s) => s.connected);
  const killError = useStore((s) => s.killError);
  const killSuccess = useStore((s) => s.killSuccess);
  const clearKillFeedback = useStore((s) => s.clearKillFeedback);
  const detailPanelId = useStore((s) => s.detailPanelId);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [commandPanelOpen, setCommandPanelOpen] = useState(false);

  useEffect(() => {
    connectStream();
    startUsage5hPolling();
    fetchInitialInbox();
    fetchInitialEvents();
    fetchInitialHealth();
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // Crash notification polling (Phase D.2) — poll every 2s while mounted
  useEffect(() => {
    const POLL_MS = 2_000;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
        const since = useStore.getState().crashNotificationLastChecked;
        const res = await fetch(`${base}/api/crash-notification/check?since=${since}`);
        if (!res.ok) return;
        const data = await res.json() as { notifications: CrashNotificationEntry[] };
        if (!data.notifications?.length) return;
        useStore.getState().addCrashNotifications(data.notifications);
        // Dispatch each to macOS notification center via Tauri
        for (const entry of data.notifications) {
          await useStore.getState().dispatchTauriNotification(entry);
        }
      } catch { /* silent */ }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // 'T' key — toggle theme (skip on inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 't' || e.key === 'T') toggleTheme();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleTheme]);

  return (
    <>
      <div className="min-h-full max-w-screen-2xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <span>👁️</span> heaveneye
              </h1>
              <p className="text-xs text-slate-400">Agent Monitor — view-only dashboard</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 ml-4">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              {connected ? 'connected' : 'disconnected'}
            </div>
            {(killError || killSuccess) && (
              <div className={`text-xs rounded px-3 py-1.5 ml-4 ${killError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                {killError ?? killSuccess}
                <button onClick={clearKillFeedback} className="ml-2 opacity-60 hover:opacity-100">×</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ExportPanel />
            <UsagePanel />
            <button
              onClick={() => setAlertSettingsOpen(true)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              title="Alert Settings"
            >
              🔔 Alerts
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              title="Chat"
            >
              💬 Chat
            </button>
            <button
              onClick={() => setCommandPanelOpen(true)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              title="Bridge Command"
            >
              🌉 Bridge
            </button>
            <VoiceTTS />
          </div>
        </header>

        {/* Proactive hint banners — surface alert threshold events */}
        <ProactiveHintBanner />

        {/* Gateway health strip */}
        <div className="px-6 mb-4">
          <SystemHealth />
        </div>

        {/* Team health summary strip (Phase E9) */}
        <div className="px-6 mb-4">
          <HealthStrip />
        </div>

        {/* Quota gauges — 5h cap % + weekly cap % + reset countdown + burn rate */}
        <div className="px-6 mb-4">
          <LazyQuotaPanel />
        </div>

        {/* MissionControl panel — quota state + epic pipeline + parked cards + activity */}
        <div className="px-6 mb-4">
          <MissionControlPanel />
        </div>

        {/* Provider rollup */}
        <div className="px-6 mb-4">
          <ProviderPanel />
        </div>

        {/* Virtual Office Map */}
        <div className="px-6 mb-6">
          <OfficeMap />
        </div>

        {/* Cross-board kanban summary */}
        <div className="px-6 mb-4">
          <CrossBoardDashboard />
        </div>

        {/* Reports viewer */}
        <div className="px-6 mb-4">
          <ReportViewer />
        </div>
      </div>

      {/* Detail panel — slides in on AgentCard click */}
      {detailPanelId && (
        <Suspense fallback={null}>
          <LazyDetailPanel />
        </Suspense>
      )}

      {/* Persistent overlays */}
      <InboxPanel />
      <TaskFeedSidebar />
      <ToastContainer />
      <CommandPalette />
      {alertSettingsOpen && (
        <AlertSettings onClose={() => setAlertSettingsOpen(false)} />
      )}
      {chatOpen && (
        <ChatPanel onClose={() => setChatOpen(false)} />
      )}
      <AnimatePresence>
        {commandPanelOpen && (
          <CommandPanel onClose={() => setCommandPanelOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
