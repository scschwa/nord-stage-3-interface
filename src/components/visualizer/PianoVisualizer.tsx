import { FallingBars } from "./FallingBars";
import { KeyboardDisplay } from "./KeyboardDisplay";
import "./PianoVisualizer.css";

export function PianoVisualizer() {
  return (
    <div className="piano-visualizer">
      <div className="falling-bars-area">
        <FallingBars />
      </div>
      <div className="keyboard-area">
        <KeyboardDisplay />
      </div>
    </div>
  );
}
