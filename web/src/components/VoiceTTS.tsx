// J4a — Web Speech Synthesis th-TH (macOS Kanya voice)
// Native API only (no npm). prefers-reduced-motion: no audio, static toggle.

import { useState, useCallback } from 'react';
import { useReducedMotion } from 'motion/react';

const THAI_TEXT = 'จักรพรรดิ';
const VOICE_LANG = 'th-TH';

function findKanyaVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Prefer Kanya on macOS; fall back to any th-TH female voice, then any th-TH
  const thai = voices.filter((v) => v.lang === VOICE_LANG);
  const kanya = thai.find((v) => /kanya/i.test(v.name));
  if (kanya) return kanya;
  const female = thai.find((v) => /female|ผู้หญิง/i.test(v.name));
  if (female) return female;
  return thai[0] ?? null;
}

export function VoiceTTS() {
  const [enabled, setEnabled] = useState(false);
  const [supported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  const prefersReducedMotion = useReducedMotion();

  const speak = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    const voice = findKanyaVoice(voices) ?? voices.find((v) => v.lang === VOICE_LANG) ?? null;
    const utter = new SpeechSynthesisUtterance(THAI_TEXT);
    utter.lang = VOICE_LANG;
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  }, [supported]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next && !prefersReducedMotion) speak();
      return next;
    });
  }, [prefersReducedMotion, speak]);

  // Static when reduced-motion — no audio, no animation
  if (prefersReducedMotion) {
    return (
      <button
        onClick={toggle}
        disabled={!supported}
        className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 disabled:opacity-30"
        title={supported ? 'TTS th-TH (static — reduced motion)' : 'TTS not supported'}
      >
        🔊 <span className="text-[10px]">TTS</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={!supported}
      className={`text-xs transition-colors flex items-center gap-1 disabled:opacity-30 ${
        enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-400 hover:text-slate-200'
      }`}
      title={supported ? (enabled ? 'ปิด TTS' : 'เปิด TTS th-TH') : 'TTS not supported'}
    >
      {enabled ? '🔊' : '🔇'} <span className="text-[10px]">TTS</span>
    </button>
  );
}
