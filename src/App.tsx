import { useState } from "react";
import { Toolbar } from "./components/layout/Toolbar";
import { PianoVisualizer } from "./components/visualizer/PianoVisualizer";
import { SheetMusicPanel } from "./components/sheetmusic/SheetMusicPanel";
import { PatchPanel } from "./components/patchviewer/PatchPanel";
import { AiAssistant } from "./components/ai/AiAssistant";
import { MidiMonitor } from "./components/midi/MidiMonitor";
import { useMidi } from "./hooks/useMidi";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("visualizer");
  const { inputPorts, connectToPort, disconnect, error } = useMidi();

  return (
    <div className="app">
      <Toolbar
        inputPorts={inputPorts}
        onConnect={connectToPort}
        onDisconnect={disconnect}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {error && (
        <div className="midi-error">
          <strong>MIDI Error:</strong> {error}
        </div>
      )}

      <main className="app-content">
        {activeTab === "visualizer" && <PianoVisualizer />}
        {activeTab === "sheetmusic" && <SheetMusicPanel />}
        {activeTab === "patch" && <PatchPanel />}
        {activeTab === "ai" && <AiAssistant />}
        {activeTab === "monitor" && <MidiMonitor />}
      </main>
    </div>
  );
}
