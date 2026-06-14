// Minimal test: Web Speech API SpeechRecognition lang=th-TH
// STEP 0 investigation for J3

import { useEffect, useRef, useState } from "react";

export default function VoiceSTTTest() {
  const [status, setStatus] = useState<string>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("SpeechRecognition API NOT available in this browser");
      setStatus("fail");
      return;
    }

    setStatus("api-available");

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "th-TH";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
      setStatus("success");
    };

    recognition.onerror = (event: any) => {
      setError(`error: ${event.error}`);
      setStatus("fail");
    };

    recognition.onend = () => {
      if (status === "api-available") setStatus("idle");
    };

    // Auto-start test
    try {
      recognition.start();
      setStatus("listening");
      setTimeout(() => {
        try { recognition.stop(); } catch {}
      }, 3000);
    } catch (e: any) {
      setError(`start failed: ${e.message}`);
      setStatus("fail");
    }

    return () => {
      try { recognition.abort(); } catch {}
    };
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h3>Web Speech API — th-TH Test</h3>
      <p>Status: <strong>{status}</strong></p>
      <p>Transcript: {transcript || "—"}</p>
      {error && <p style={{color:"red"}}>Error: {error}</p>}
    </div>
  );
}
