// J3v2-b — Web Speech API SpeechRecognition th-TH
// Native API only (no npm dep). PTT/toggle style.
// Browser fallback: vite/Safari works; Tauri macOS requires manual grant
// in System Preferences (tauri-apps/tauri#11951).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export interface VoiceSTTHandle {
  /** Inject text externally (e.g. from a test harness) */
  injectText: (text: string) => void;
}

interface VoiceSTTProps {
  /** Called with the final recognized transcript string */
  onResult: (text: string) => void;
  /** Additional className for the button */
  className?: string;
}

type Status = 'idle' | 'listening' | 'success' | 'error' | 'unsupported';

export function VoiceSTT({ onResult, className = '' }: VoiceSTTProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [supported] = useState(() =>
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) != null,
  );
  const prefersReducedMotion = useReducedMotion();
  const recognitionRef = useRef<any>(null);
  // Track if user is currently pressing (PTT mode)
  const isPressingRef = useRef(false);

  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    isPressingRef.current = false;
    setStatus('idle');
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('unsupported');
      return;
    }

    // Clean up any previous instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'th-TH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript as string;
      if (result.trim()) {
        onResult(result);
        setStatus('success');
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' is normal when user releases without speaking
      if (event.error === 'no-speech') {
        setStatus('idle');
        return;
      }
      setStatus('error');
    };

    recognition.onend = () => {
      isPressingRef.current = false;
      setStatus((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    try {
      recognition.start();
      isPressingRef.current = true;
      setStatus('listening');
    } catch (e) {
      setStatus('error');
    }
  }, [onResult]);

  // Press-and-hold (PTT) pattern: mousedown = start, mouseup = stop
  const handleMouseDown = useCallback(() => {
    if (!supported) return;
    startRecognition();
  }, [supported, startRecognition]);

  const handleMouseUp = useCallback(() => {
    if (!supported) return;
    stopRecognition();
  }, [supported, stopRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Static when reduced-motion — no animated waveform, just a static mic icon
  if (prefersReducedMotion) {
    return (
      <button
        type="button"
        disabled={!supported}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        className={`text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors ${className}`}
        title={supported ? '🎤 กดค้างเพื่อพูด (STT th-TH)' : 'SpeechRecognition not supported'}
        aria-label="Voice STT"
      >
        🎤
      </button>
    );
  }

  // Animated state
  const isListening = status === 'listening';

  return (
    <button
      type="button"
      disabled={!supported}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      className={`transition-colors disabled:opacity-30 ${className} ${
        isListening
          ? 'text-rose-400 hover:text-rose-300'
          : 'text-slate-400 hover:text-slate-200'
      }`}
      title={
        supported
          ? isListening
            ? '🎤 กำลังฟัง... (ปล่อยปุ่มเพื่อหยุด)'
            : '🎤 กดค้างเพื่อพูด (STT th-TH)'
          : 'SpeechRecognition not supported'
      }
      aria-label={isListening ? 'Listening...' : 'Voice STT'}
    >
      {isListening ? (
        // Animated waveform bars
        <span className="flex items-center gap-px">
          <span className="inline-block w-0.5 h-3 bg-rose-400 rounded-full animate-pulse" style={{ animationDuration: '0.6s' }} />
          <span className="inline-block w-0.5 h-2 bg-rose-400 rounded-full animate-pulse" style={{ animationDuration: '0.4s', animationDelay: '0.1s' }} />
          <span className="inline-block w-0.5 h-3.5 bg-rose-400 rounded-full animate-pulse" style={{ animationDuration: '0.5s', animationDelay: '0.2s' }} />
          <span className="inline-block w-0.5 h-2 bg-rose-400 rounded-full animate-pulse" style={{ animationDuration: '0.7s', animationDelay: '0.15s' }} />
          <span className="inline-block w-0.5 h-3 bg-rose-400 rounded-full animate-pulse" style={{ animationDuration: '0.55s', animationDelay: '0.25s' }} />
        </span>
      ) : (
        '🎤'
      )}
    </button>
  );
}
