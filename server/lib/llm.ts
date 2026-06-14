/**
 * llm.ts — LLM client for /api/chat
 * Primary: MiniMax-M2.7 (team quota, included in plan). Requires MINIMAX_API_KEY.
 * Fallback: OpenRouter anthropic/claude-haiku-4.5 (when MiniMax is rate-limited/down).
 *   Requires OPENROUTER_API_KEY. max_tokens capped at 1024 for cost control.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  /** Optional JSON payload for structured epic draft suggestion */
  extra?: {
    boardAgents: string;
    recentEvents: string;
    agentCostContext: string;
  };
}

interface LLMChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface LLMResponse {
  id: string;
  choices: LLMChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message: string; code: string };
}

const OPENROUTER_MODEL = 'anthropic/claude-haiku-4.5';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MINIMAX_MODEL = 'MiniMax-M2.7';
const MINIMAX_BASE = 'https://api.minimax.io/anthropic/v1';

async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? 'not-set';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_NAME) headers['X-Title'] = process.env.OPENROUTER_SITE_NAME;

  const body: Record<string, unknown> = {
    model: OPENROUTER_MODEL,
    messages,
    max_tokens: 1024,
  };

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json() as LLMResponse;

  if (data.error) {
    throw new Error(`OpenRouter error ${data.error.code}: ${data.error.message}`);
  }

  const choice = data.choices[0];
  if (!choice) throw new Error('No completion choice returned');

  return choice.message.content;
}

async function callMinimax(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const body: Record<string, unknown> = {
    model: MINIMAX_MODEL,
    messages,
    stream: false,
    max_tokens: 1024,
  };

  const res = await fetch(`${MINIMAX_BASE}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error');
    throw new Error(`MiniMax HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json() as LLMResponse;

  if (data.error) {
    throw new Error(`MiniMax error: ${data.error.message}`);
  }

  const choice = data.choices[0];
  if (!choice) throw new Error('No completion choice returned');

  return choice.message.content;
}

export async function chatCompletion(options: ChatOptions): Promise<string> {
  // Primary: MiniMax-M2.7 (team quota, included in plan). Fallback: OpenRouter
  // claude-haiku-4.5 (when MiniMax is rate-limited/down). Mirrors the agents'
  // fallback chain so chat stays up even during a MiniMax 5h-cap outage.
  try {
    return await callMinimax(options.messages);
  } catch (minimaxErr) {
    console.warn('[llm] MiniMax failed, falling back to OpenRouter:', String(minimaxErr));
    return await callOpenRouter(options.messages);
  }
}

/**
 * Build a system prompt that includes current board context + per-agent cost.
 */
export function buildSystemPrompt(boardAgents: string, recentEvents: string, agentCostContext: string): string {
  return `คุณคือผู้ช่วย AI ของ Heaveneye Dashboard — ระบบ monitor สำหรับทีม Hermes agents

## ข้อมูลทีมปัจจุบัน
${boardAgents}

## ค่าใช้จ่ายและการใช้งานวันนี้ (per-agent)
${agentCostContext}

## เหตุการณ์ล่าสุดจาก Kanban board
${recentEvents}

## กฎการตอบ
- ตอบเป็นภาษาไทยเสมอ
- ถ้าข้อความของผู้ใช้มี intent ที่เป็น "team command" (เช่น สั่งให้ agent ทำงาน, สร้าง task ใหม่, ปรับ priority, หรือ dispatch งาน) → ในคำตอบให้แนะนำ epic draft ที่เป็น structure ของ task ที่ควรถูกสร้าง แต่ **ไม่ auto-dispatch** — มีแค่ suggestion พร้อมระบุว่า "ต้องให้ anmaioyi หรือ ji-ziyue approve ก่อน"
- ถ้าไม่มี intent เป็น command → ตอบ conversationally ตามปกติ
- กรณีถามเรื่อง status ของ agent/task ให้อ้างอิงจากข้อมูลทีมด้านบน

## ห้าม
- ไม่ตอบในภาษาอังกฤษ (ยกเว้นชื่อ model/tool ที่เป็นภาษาอังกฤษ)
- ไม่สร้าง task จริงในระบบ — มีแค่ draft suggestion`;
}

/**
 * Detect if a user message contains a team-command intent.
 * Returns true if the message looks like a directive to create/dispatch/modify work.
 */
export function hasTeamCommandIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const cmdPatterns = [
    /\b(สร้าง|สั่ง|มอบหมาย|dispatch|assign|create|spawn)\b/,
    /\b(task|งาน|card|kanban)\b/,
    /\b(agent|worker|specialist)\b/,
    /\b(priority|urgent|เร่งด่วน)\b/,
    /\b(orchestrat|coordinat)\b/,
  ];
  return cmdPatterns.some((p) => p.test(lower));
}

/**
 * Build an epic draft suggestion from the user's message.
 */
export function buildEpicDraft(userMessage: string, boardAgents: string): string {
  return `📋 Epic Draft — ต้องได้รับการ approve ก่อน dispatch

**User request:** "${userMessage}"

**ฉบับร่างเบื้องต้น:**
- Title: [Epic จาก request ด้านบน]
- Assignee: anmaioyi (สำหรับ decompose ต่อ)
- Priority: medium
- Epic: BRIDGE
- Notes: ได้รับคำสั่งจาก /api/chat — รอ ji-ziyue หรือ anmaioyi approve ก่อนสร้างจริง

**Board:** heaveneye-ui
**Current agents on board:** ${boardAgents.split('\n').slice(0, 3).join(', ')}

---
_⚠️ นี่คือ draft suggestion เท่านั้น — ยังไม่ถูกสร้างในระบบ ต้องได้รับการ approve ก่อน_`;
}
