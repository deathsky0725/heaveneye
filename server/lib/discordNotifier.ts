/**
 * discordNotifier.ts — L2 Discord push for proactive alerts.
 *
 * Posts to Discord via webhook (no bot token needed) to #hermes-agent
 * channel (chat id 1504475321142087681).
 *
 * ASCII-only content per Discord rule; emoji are stripped/replaced.
 * Reads DISCORD_WEBHOOK_URL from env — silent no-op if not set.
 */

const DISCORD_CHANNEL_ID = '1504475321142087681';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/** Strip non-ASCII (Discord requirement) but preserve structure */
function toAscii(msg: string): string {
  // Replace known emoji with text equivalents
  let result = msg;
  for (const [emoji, replacement] of Object.entries(EMOJI_REPLACEMENTS)) {
    result = result.split(emoji).join(replacement);
  }
  // Replace remaining non-ASCII with codepoint placeholder
  return result.replace(/[^\x00-\x7F]/g, (c) => {
    const cp = c.codePointAt(0);
    return cp !== undefined ? `[U+${cp.toString(16).toUpperCase().padStart(4, '0')}]` : '[?]';
  });
}

const EMOJI_REPLACEMENTS: Record<string, string> = {
  '⚠️': '[!]',
  '🤖': '[BOT]',
  '🎉': '[DONE]',
  '🅿️': '[PARK]',
  '🔥': '[FIRE]',
  '👁️': '[EYE]',
  '🚨': '[ALERT]',
  '⏰': '[TIME]',
  '💬': '[CHAT]',
  '✅': '[OK]',
  '❌': '[X]',
};

/** Build a compact embed-friendly text from an alert message */
function formatAlertText(type: string, severity: string, target: string, ts: string): string {
  const emoji = severity === 'critical' ? '[FIRE]' : '[!]';
  const time = ts ? ` @ ${ts.replace('T', ' ').slice(0, 16)}Z` : '';
  return `${emoji} ${type} — ${target}${time}`;
}

/**
 * Fire one Discord notification.
 * Silently no-ops if DISCORD_WEBHOOK_URL is not set or throttle blocks it.
 */
export async function fireDiscordNotification(
  type: string,
  severity: string,
  target: string,
  message: string,
  ts: string,
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;

  const payload = {
    content: toAscii(`[heaveneye] ${formatAlertText(type, severity, target, ts)}\n${toAscii(message)}`),
  };

  try {
    const res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[discord] webhook POST failed: ${res.status} ${res.statusText}`);
    }
  } catch (e) {
    console.warn('[discord] webhook error:', e);
  }
}
