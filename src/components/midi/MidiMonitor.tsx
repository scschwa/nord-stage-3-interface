import { useRef, useEffect } from "react";
import { useMidiStore } from "../../store/midiStore";
import { getCCName } from "../../lib/midi/ccMapper";
import { midiNoteToName } from "../../lib/midi/MidiEngine";
import "./MidiMonitor.css";

export function MidiMonitor() {
  const recentEvents = useMidiStore((s) => s.recentEvents);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [recentEvents]);

  return (
    <div className="midi-monitor">
      <div className="monitor-header">MIDI Monitor</div>
      <div className="monitor-log" ref={scrollRef}>
        {recentEvents.slice(-50).map((event, i) => (
          <div key={i} className={`event-row event-${event.type}`}>
            <span className="event-type">{event.type}</span>
            <span className="event-detail">{formatEvent(event)}</span>
            <span className="event-ch">ch{event.channel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatEvent(event: ReturnType<typeof useMidiStore.getState>["recentEvents"][0]): string {
  switch (event.type) {
    case "noteOn":
    case "noteOff":
      return `${midiNoteToName(event.note!)} vel:${event.velocity}`;
    case "controlChange":
      return `${getCCName(event.controller!)} = ${event.value}`;
    case "programChange":
      return `Program ${event.program}`;
    case "pitchBend":
      return `Bend ${event.bend}`;
    case "channelPressure":
      return `Pressure ${event.pressure}`;
    default:
      return event.raw.map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }
}
