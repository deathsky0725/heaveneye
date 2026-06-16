/**
 * HealthStrip.test.tsx
 * bun:test + happy-dom — mock store agents, assert bucket labels + counts
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Browser } from 'happy-dom';
import { HealthStrip } from '../components/HealthStrip';
import type { AgentSnapshot } from '../types';

// ── mock agents matching store snapshot shape ────────────────────────────────
const MOCK_AGENTS: AgentSnapshot[] = [
  {
    id: 'shihao',
    name: 'Shihao',
    role: 'Frontend Dev',
    color: '#3b82f6',
    team: 'hermes',
    status: 'working',
    currentTask: { id: 't_abc', title: 'N2 component tests' },
    currentBoard: 'heaveneye',
    lastTool: 'terminal',
    tokensToday: { input: 40_000, output: 60_000, cacheRead: 10_000, cacheCreate: 5_000 },
    lastEventAt: new Date().toISOString(),
    currentModel: 'MiniMax-M2.7',
    provider: 'minimax',
    // healthFlag undefined = healthy
  },
  {
    id: 'yefan',
    name: 'Yefan',
    role: 'Backend Dev',
    color: '#22c55e',
    team: 'hermes',
    status: 'thinking',
    currentTask: { id: 't_def', title: 'API endpoint refactor' },
    currentBoard: 'heaveneye',
    lastTool: 'browser',
    tokensToday: { input: 55_000, output: 80_000, cacheRead: 12_000, cacheCreate: 8_000 },
    lastEventAt: new Date().toISOString(),
    currentModel: 'claude-opus-4-5',
    provider: 'anthropic',
    healthFlag: 'stuck',
  },
  {
    id: 'anmaioyi',
    name: 'An Maioyi',
    role: 'Coordinator',
    color: '#f59e0b',
    team: 'core',
    status: 'working',
    tokensToday: { input: 20_000, output: 30_000, cacheRead: 5_000, cacheCreate: 2_000 },
    lastEventAt: new Date().toISOString(),
    currentModel: 'gemini-2.5-pro',
    provider: 'gemini',
    healthFlag: 'crash-loop',
  },
  {
    id: 'jianfeng',
    name: 'Jianfeng',
    role: 'Specialist',
    color: '#a855f7',
    team: 'core',
    status: 'idle',
    tokensToday: { input: 5_000, output: 3_000, cacheRead: 500, cacheCreate: 100 },
    lastEventAt: new Date().toISOString(),
    currentModel: 'unknown-model',
    provider: 'unknown',
    // healthFlag undefined → healthy
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────
async function createBrowserWithWindow(): Promise<Browser> {
  const browser = new Browser();
  const page = browser.newPage();
  const win = page.mainFrame.window;
  (globalThis as any).window = win;
  (globalThis as any).document = page.mainFrame.document;
  return browser;
}

let _root: any = null;

async function mountHealthStrip(browser: Browser, agents: AgentSnapshot[]): Promise<any> {
  const { useStore } = await import('../store');
  // Seed store with mock agents before mounting
  useStore.setState({ agents });

  const page = browser.newPage();
  const doc = page.mainFrame.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(container as any);
  _root = root;
  root.render(React.createElement(HealthStrip));

  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  return container;
}

function unmountHealthStrip() {
  if (_root) {
    try { _root.unmount(); } catch { /* already unmounted */ }
    _root = null;
  }
}

// ── tests ───────────────────────────────────────────────────────────────────
describe('HealthStrip', () => {
  let browser: Browser;

  beforeEach(async () => {
    unmountHealthStrip();
    browser = await createBrowserWithWindow();
  });

  afterEach(async () => {
    unmountHealthStrip();
    const { useStore } = await import('../store');
    useStore.setState({ agents: [] });
    delete (globalThis as any).fetch;
    // Note: window/document kept on globalThis — React scheduler deferred callbacks
    // (postMessage/setTimeout) read window.event after unmount. Safe because each
    // test gets its own Browser instance.
    if (browser) await browser.close();
  });

  test('renders all bucket labels in Thai', async () => {
    const container = await mountHealthStrip(browser, MOCK_AGENTS);
    expect(container.textContent).toContain('สุขภาพดี');
    expect(container.textContent).toContain('ติดอยู่');
    expect(container.textContent).toContain('ล้มเหลวซ้ำ');
  });

  test('renders correct bucket counts', async () => {
    const container = await mountHealthStrip(browser, MOCK_AGENTS);
    // healthy: shihao + jianfeng = 2, stuck: yefan = 1, crash-loop: anmaioyi = 1
    expect(container.textContent).toContain('2'); // healthy count
    expect(container.textContent).toContain('1'); // stuck count
    expect(container.textContent).toContain('1'); // crash-loop count
  });

  test('renders empty when all agents are healthy', async () => {
    const allHealthy: AgentSnapshot[] = MOCK_AGENTS.map((a) => ({ ...a, healthFlag: undefined as any }));
    const container = await mountHealthStrip(browser, allHealthy);
    // All 4 are healthy → show "4" chip, no stuck/crash-loop chips
    expect(container.textContent).toContain('4');
    expect(container.textContent).not.toContain('ติดอยู่');
    expect(container.textContent).not.toContain('ล้มเหลวซ้ำ');
  });

  test('hides buckets with zero count', async () => {
    // Only yefan (stuck) — no crash-loop agents
    const onlyStuck: AgentSnapshot[] = [MOCK_AGENTS[1]!];
    const container = await mountHealthStrip(browser, onlyStuck);
    expect(container.textContent).toContain('ติดอยู่');
    expect(container.textContent).not.toContain('ล้มเหลวซ้ำ');
  });

  test('renders iteration-exhausted bucket label', async () => {
    const iterationExhausted = [{ ...(MOCK_AGENTS[0] as any), id: 'wenshu', healthFlag: 'iteration-exhausted' }] as any;
    const container = await mountHealthStrip(browser, iterationExhausted);
    expect(container.textContent).toContain('หมด iteration');
  });

  test('renders silent-done bucket label', async () => {
    const silentDone = [{ ...(MOCK_AGENTS[0] as any), id: 'yanxin', healthFlag: 'silent-done' }] as any;
    const container = await mountHealthStrip(browser, silentDone);
    expect(container.textContent).toContain('silent-done');
  });
});
