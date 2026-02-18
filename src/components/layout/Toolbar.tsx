import { DeviceSelector } from "../midi/DeviceSelector";
import { MidiPort } from "../../hooks/useMidi";
import "./Toolbar.css";

interface Props {
  inputPorts: MidiPort[];
  onConnect: (portId: string) => void;
  onDisconnect: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "visualizer", label: "Visualizer" },
  { id: "sheetmusic", label: "Sheet Music" },
  { id: "patch", label: "Patch Viewer" },
  { id: "ai", label: "AI Designer" },
  { id: "monitor", label: "MIDI Monitor" },
];

export function Toolbar({ inputPorts, onConnect, onDisconnect, activeTab, onTabChange }: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-nord">Nord</span>
        <span className="brand-title"> Stage 3</span>
      </div>

      <nav className="toolbar-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="toolbar-device">
        <DeviceSelector
          ports={inputPorts}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      </div>
    </header>
  );
}
