import { MidiPort } from "../../hooks/useMidi";
import { useMidiStore } from "../../store/midiStore";
import "./DeviceSelector.css";

interface Props {
  ports: MidiPort[];
  onConnect: (portId: string) => void;
  onDisconnect: () => void;
}

export function DeviceSelector({ ports, onConnect, onDisconnect }: Props) {
  const { inputPortName, isConnected } = useMidiStore();

  if (isConnected) {
    return (
      <div className="device-selector connected">
        <span className="status-dot connected" />
        <span className="port-name">{inputPortName}</span>
        <button className="disconnect-btn" onClick={onDisconnect}>Disconnect</button>
      </div>
    );
  }

  if (ports.length === 0) {
    return (
      <div className="device-selector empty">
        <span className="status-dot disconnected" />
        <span className="no-device">No MIDI devices found</span>
      </div>
    );
  }

  return (
    <div className="device-selector">
      <span className="status-dot disconnected" />
      <select
        className="port-select"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onConnect(e.target.value);
        }}
      >
        <option value="" disabled>Select MIDI input…</option>
        {ports.map((port) => (
          <option key={port.id} value={port.id}>
            {port.name}
          </option>
        ))}
      </select>
    </div>
  );
}
