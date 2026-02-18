import { useSessionStore } from "../../store/sessionStore";
import "./ExportModal.css";

interface Props {
  onClose: () => void;
}

export function ExportModal({ onClose }: Props) {
  const { musicXml, detectedBpm, capturedNotes } = useSessionStore();

  const downloadMusicXml = () => {
    if (!musicXml) return;
    const blob = new Blob([musicXml], { type: "application/vnd.recordare.musicxml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nord-capture-${new Date().toISOString().slice(0, 16).replace("T", "_")}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printScore = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Sheet Music</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="export-summary">
            <div className="summary-stat">
              <span className="stat-label">Notes</span>
              <span className="stat-value">{capturedNotes.length}</span>
            </div>
            {detectedBpm && (
              <div className="summary-stat">
                <span className="stat-label">Detected BPM</span>
                <span className="stat-value">{detectedBpm}</span>
              </div>
            )}
          </div>

          <div className="export-options">
            <button className="export-btn primary" onClick={downloadMusicXml} disabled={!musicXml}>
              <span className="export-icon">♩</span>
              <div>
                <div className="export-btn-title">Download MusicXML</div>
                <div className="export-btn-desc">Open in MuseScore, Finale, Sibelius</div>
              </div>
            </button>

            <button className="export-btn secondary" onClick={printScore} disabled={!musicXml}>
              <span className="export-icon">⎙</span>
              <div>
                <div className="export-btn-title">Print / Save PDF</div>
                <div className="export-btn-desc">Print the score or save as PDF</div>
              </div>
            </button>
          </div>

          <p className="export-note">
            MusicXML is supported by all major notation software. For best results,
            import into MuseScore (free) to clean up notation and add a title.
          </p>
        </div>
      </div>
    </div>
  );
}
