import "./SheetMusicPanel.css";

export function SheetMusicPanel() {
  return (
    <div className="panel-placeholder">
      <div className="placeholder-icon">♩</div>
      <h2>Sheet Music</h2>
      <p>Coming in Phase 2.</p>
      <p className="placeholder-detail">
        Hit Record, play your Nord, then see live sheet music rendered here.
        Export to PDF or MusicXML when done.
      </p>
    </div>
  );
}
