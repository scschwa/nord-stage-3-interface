import "../sheetmusic/SheetMusicPanel.css";

export function PatchPanel() {
  return (
    <div className="panel-placeholder">
      <div className="placeholder-icon">🎛</div>
      <h2>Patch Viewer</h2>
      <p>Coming in Phase 3.</p>
      <p className="placeholder-detail">
        Load an .ns3fp patch file to see all settings for Piano, Organ, Synth,
        and Effects sections. Auto-updates when you change programs on your Nord.
      </p>
    </div>
  );
}
