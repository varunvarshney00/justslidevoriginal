import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// Extend Window for Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Press the mic to speak");
  const [statusError, setStatusError] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [hasSpeechApi, setHasSpeechApi] = useState(true);
  const [explaining, setExplaining] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final_ = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final_ += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const current = final_ || interim;
        transcriptRef.current = current;
        setTranscript(current);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech error:", event.error);
        setIsRecording(false);
        if (event.error === "not-allowed") {
          updateStatus("Microphone access denied. Use text input instead.", true);
          setShowFallback(true);
        } else {
          updateStatus("Speech error: " + event.error, true);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (transcriptRef.current.trim()) {
          updateStatus('Ready! Click "Start Explain"');
        } else {
          updateStatus("Press the mic to speak");
        }
      };

      recognitionRef.current = recognition;
    } else {
      setHasSpeechApi(false);
      setShowFallback(true);
      updateStatus("Type your question below");
    }
  }, []);

  // Re-enable UI when window regains visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        setExplaining(false);
        if (transcriptRef.current.trim()) {
          updateStatus('Ready! Click "Start Explain" or record again');
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const updateStatus = (msg: string, isError = false) => {
    setStatus(msg);
    setStatusError(isError);
  };

  const toggleRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      updateStatus("Listening... Speak your question");
      recognitionRef.current.start();
    }
  }, [isRecording]);

  const handleTextInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      transcriptRef.current = value;
      setTranscript(value);
    },
    []
  );

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && transcriptRef.current.trim()) {
        startExplain();
      }
    },
    []
  );

  const startExplain = useCallback(async () => {
    const query = transcriptRef.current.trim();
    if (!query) return;

    setExplaining(true);
    updateStatus("Launching visual explanation...");

    try {
      await invoke("start_explain", { query });
    } catch (err) {
      updateStatus("Error: " + err, true);
      setExplaining(false);
    }
  }, []);

  const canExplain = transcript.trim().length > 0 && !explaining;

  return (
    <main className="container">
      <h1 className="title">🎨 Clicky</h1>
      <p className="subtitle">Speak your question, see it drawn</p>

      {hasSpeechApi && (
        <button
          id="mic-btn"
          className={`mic-btn ${isRecording ? "recording" : ""}`}
          onClick={toggleRecording}
          title="Click to speak"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      )}

      <div id="transcript-box" className="transcript-box">
        {transcript ? (
          <span className="transcript-text">{transcript}</span>
        ) : (
          <span className="placeholder">Your words will appear here...</span>
        )}
      </div>

      {showFallback && (
        <div className="fallback-input">
          <input
            type="text"
            id="text-input"
            className="text-input"
            placeholder="Type your question here..."
            value={transcript}
            onChange={handleTextInput}
            onKeyDown={handleTextKeyDown}
          />
        </div>
      )}

      <button
        id="explain-btn"
        className="explain-btn"
        disabled={!canExplain}
        onClick={startExplain}
      >
        ✨ Start Explain
      </button>

      <p id="status" className={`status ${statusError ? "error" : ""}`}>
        {status}
      </p>
    </main>
  );
}

export default App;
