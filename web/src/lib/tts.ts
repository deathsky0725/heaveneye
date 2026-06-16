// Shared Thai TTS (Web Speech Synthesis, native — no npm).
// Used by: VoiceTTS header toggle (enable/disable) + ChatPanel (reads จื่อเย่ replies aloud).
import { create } from 'zustand';

const VOICE_LANG = 'th-TH';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickThaiVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const thai = window.speechSynthesis.getVoices().filter((v) => v.lang === VOICE_LANG);
  return (
    thai.find((v) => /kanya/i.test(v.name)) ??
    thai.find((v) => /female|ผู้หญิง/i.test(v.name)) ??
    thai[0] ??
    null
  );
}

/** Speak Thai text aloud (cancels any in-progress utterance first). */
export function speakThai(text: string): void {
  if (!ttsSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = VOICE_LANG;
  const voice = pickThaiVoice();
  if (voice) utter.voice = voice;
  utter.rate = 1;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

interface TTSState {
  enabled: boolean;
  toggle: () => void;
}

/** Global TTS on/off — header toggle controls it, ChatPanel reads it. */
export const useTTS = create<TTSState>((set) => ({
  enabled: false,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
}));
