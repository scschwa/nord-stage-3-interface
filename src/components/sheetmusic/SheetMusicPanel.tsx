import { useEffect, useRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useSessionStore } from "../../store/sessionStore";
import { useNoteCapture } from "../../hooks/useNoteCapture";
import { useMidiStore } from "../../store/midiStore";
import { CaptureControls } from "./CaptureControls";
import { ExportModal } from "./ExportModal";
import "./SheetMusicPanel.css";

export function SheetMusicPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const { musicXml, recordingState } = useSessionStore();
  const isConnected = useMidiStore((s) => s.isConnected);

  // Mount note capture effect
  useNoteCapture();

  // Initialize OSMD
  useEffect(() => {
    if (!containerRef.current) return;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: false,
      drawLyricist: false,
      drawCredits: false,
      followCursor: false,
      pageFormat: "Endless",
      drawingParameters: "default",
    });
    osmdRef.current = osmd;

    return () => {
      osmdRef.current = null;
    };
  }, []);

  // Render MusicXML when it changes
  useEffect(() => {
    if (!osmdRef.current || !musicXml) return;

    setIsRendering(true);
    setRenderError(null);

    osmdRef.current
      .load(musicXml)
      .then(() => {
        osmdRef.current?.render();
        setIsRendering(false);
      })
      .catch((err) => {
        console.error("OSMD render error:", err);
        setRenderError("Failed to render sheet music. Try recording again.");
        setIsRendering(false);
      });
  }, [musicXml]);

  const handleExport = useCallback(() => setShowExport(true), []);

  return (
    <div className="sheet-music-panel">
      <CaptureControls onExport={handleExport} />

      <div className="sheet-music-content">
        {recordingState === "idle" && !musicXml && (
          <div className="sheet-placeholder">
            {isConnected ? (
              <>
                <div className="placeholder-icon">♩</div>
                <p>Hit <strong>Record</strong>, then play your Nord.</p>
                <p className="placeholder-sub">Sheet music appears here when you stop recording.</p>
              </>
            ) : (
              <>
                <div className="placeholder-icon">⚡</div>
                <p>Connect your Nord Stage 3 first.</p>
                <p className="placeholder-sub">Select it from the MIDI input dropdown in the toolbar.</p>
              </>
            )}
          </div>
        )}

        {recordingState === "recording" && (
          <div className="sheet-placeholder recording">
            <div className="placeholder-icon pulse">◉</div>
            <p>Recording… play your Nord now.</p>
            <p className="placeholder-sub">Hit <strong>Stop</strong> when done.</p>
          </div>
        )}

        {recordingState === "stopped" && !musicXml && (
          <div className="sheet-placeholder">
            <div className="placeholder-icon">…</div>
            <p>Processing…</p>
          </div>
        )}

        {isRendering && (
          <div className="sheet-placeholder">
            <div className="placeholder-icon">…</div>
            <p>Generating notation…</p>
          </div>
        )}

        {renderError && (
          <div className="sheet-placeholder error">
            <div className="placeholder-icon">⚠</div>
            <p>{renderError}</p>
          </div>
        )}

        <div
          ref={containerRef}
          className={`osmd-container ${(!musicXml || isRendering || renderError !== null) ? "hidden" : ""}`}
        />
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}
