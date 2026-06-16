// J4 — TTS toggle (header). Controls the shared TTS state; when ON, ChatPanel
// reads จื่อเย่'s replies aloud via Web Speech Synthesis (th-TH). Native, no npm.
import { useCallback } from 'react';
import { useTTS, speakThai, ttsSupported } from '../lib/tts';

export function VoiceTTS() {
  const enabled = useTTS((s) => s.enabled);
  const toggle = useTTS((s) => s.toggle);
  const supported = ttsSupported();

  const onClick = useCallback(() => {
    toggle();
    // confirmation chirp when turning ON (also primes the voice list)
    if (!enabled && supported) speakThai('เปิดเสียงตอบแล้วค่ะ');
  }, [enabled, supported, toggle]);

  return (
    <button
      onClick={onClick}
      disabled={!supported}
      className={`text-xs transition-colors flex items-center gap-1 disabled:opacity-30 ${
        enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-400 hover:text-slate-200'
      }`}
      title={supported ? (enabled ? 'ปิดเสียงตอบ (TTS)' : 'เปิดเสียงตอบ จื่อเย่อ่าน reply (th-TH)') : 'TTS not supported'}
    >
      {enabled ? '🔊' : '🔇'} <span className="text-[10px]">TTS</span>
    </button>
  );
}
