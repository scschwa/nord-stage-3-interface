import { useEffect, useRef } from "react";
import { useSessionStore } from "../../store/sessionStore";
import "./CaptureControls.css";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  onExport: () => void;
}

export function CaptureControls({ onExport }: Props) {
  const { recordingState, recordingDurationMs, capturedNotes, musicXml, detectedBpm,
    startRecording, stopRecording, clearCapture, tickDuration } = useSessionStore();

  // Tick the timer every second while recording
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = window.setInterval(tickDuration, 1000);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [recordingState, tickDuration]);

  const isRecording = recordingState === "recording";
  const hasCaptured = recordingState === "stopped" && musicXml;
  const noteCount = capturedNotes.length;

  return (
    <div className="capture-controls">
      <div className="capture-left">
        {recordingState === "idle" && (
          <button className="btn-record" onClick={startRecording}>
            <span className="rec-dot" /> Record
          </button>
        )}
        {isRecording && (
          <>
            <button className="btn-stop" onClick={stopRecording}>
              <span className="stop-square" /> Stop
            </button>
            <span className="rec-timer recording">
              <span className="rec-dot pulse" />
              {formatDuration(recordingDurationMs)}
            </span>
          </>
        )}
        {recordingState === "stopped" && (
          <>
            <button className="btn-record" onClick={startRecording}>
              <span className="rec-dot" /> Record Again
            </button>
            <button className="btn-clear" onClick={clearCapture}>Clear</button>
          </>
        )}
      </div>

      <div className="capture-info">
        {isRecording && noteCount > 0 && (
          <span className="note-count">{noteCount} notes</span>
        )}
        {hasCaptured && (
          <>
            <span className="note-count">{noteCount} notes</span>
            {detectedBpm && <span className="bpm-badge">{detectedBpm} BPM</span>}
          </>
        )}
      </div>

      <div className="capture-right">
        {hasCaptured && (
          <button className="btn-export" onClick={onExport}>
            Export ↓
          </button>
        )}
      </div>
    </div>
  );
}
