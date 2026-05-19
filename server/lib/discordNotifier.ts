/**
 * discordNotifier — sends task-completion events to a Discord channel via webhook.
 *
 * Discord webhooks are the simplest way to post to a channel without a bot token.
 * Create a webhook in your Discord channel (Channel Settings → Integrations → Webhooks),
 * then set DISCORD_WEBHOOK_URL in your environment.
 *
 * Message format: "✅ [task title] completed by [assignee] [t_id]"
 *
 * Configuration (set ONE of these in your environment):
 *   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../.../...
 *   HEAVENEYE_DISCORD_WEBHOOK_URL=...   (alternative env var)
 *
 * If not configured, silently skips — heaveneye can run without Discord.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
  ?? process.env.HEAVENEYE_DISCORD_WEBHOOK_URL
  ?? '';

export interface DiscordNotifyParams {
  taskId: string;
  taskTitle: string;
  agentName: string;   // display name e.g. "เย่ฝาน"
}

/**
 * Post a task-completion notification to Discord.
 * Fire-and-forget — errors are logged but never propagate.
 */
export function notifyCompleted(params: DiscordNotifyParams): void {
  if (!WEBHOOK_URL) {
    // Silent skip — allows local dev without Discord credentials
    return;
  }

  const text = `✅ **${params.agentName}** ทำเสร็จแล้ว → \`${params.taskTitle}\` [${params.taskId}]`;

  const body = JSON.stringify({ content: text });

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch((err) => {
    console.warn('[discord-notifier] webhook POST failed:', err?.message ?? err);
  });
}