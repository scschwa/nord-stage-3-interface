import { useState, useEffect } from "react";
import { usePatchStore } from "../../store/patchStore";
import { useMidiStore } from "../../store/midiStore";
import { loadPatchFile, parsePatchFromPath } from "../../hooks/useSidecar";
import { PatchData, OrganData, SynthData, EffectsData } from "../../lib/patch/ns3fpTypes";
import "./PatchPanel.css";

// ─── Mini helpers ──────────────────────────────────────────────────────────

function Bar({ value, max = 127 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mini-bar">
      <div className="mini-bar-track">
        <div className="mini-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="mini-bar-num">{value}</span>
    </div>
  );
}

function BoolChip({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className={`bool-chip ${on ? "on" : "off"}`}>
      {on ? "●" : "○"} {label ?? (on ? "On" : "Off")}
    </span>
  );
}

function ParamCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="param-card">
      <div className="param-label">{label}</div>
      <div className="param-value">{children}</div>
    </div>
  );
}

// CC live overlay: show the live CC value next to a parameter if known
function CCOverlay({ cc }: { cc: number }) {
  const ccValues = useMidiStore((s) => s.ccValues);
  const ccState = ccValues.get(cc);
  if (!ccState) return null;
  return <span className="cc-overlay" title={`CC${cc} live`}>CC {ccState.value}</span>;
}

// ─── Drawbars ──────────────────────────────────────────────────────────────

const DRAWBAR_LABELS = ["16'", "8'", "5⅓'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];

function DrawbarsDisplay({ values, label }: { values: number[]; label: string }) {
  return (
    <div className="drawbar-group">
      <div className="drawbar-title">{label}</div>
      <div className="drawbar-row">
        {values.map((v, i) => (
          <div key={i} className="drawbar-column">
            <div className="drawbar-val">{v}</div>
            <div className="drawbar-slot">
              <div
                className="drawbar-fill"
                style={{ height: `${(v / 8) * 100}%` }}
              />
            </div>
            <div className="drawbar-label">{DRAWBAR_LABELS[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Piano section ─────────────────────────────────────────────────────────

function PianoSection({ piano }: { piano: PatchData["piano"] }) {
  return (
    <div>
      <p className="section-heading">Type &amp; Model</p>
      <div className="param-grid">
        <ParamCard label="Type">
          {piano.type}
          <CCOverlay cc={6} />
        </ParamCard>
        <ParamCard label="Timbre">{piano.timbre}</ParamCard>
        <ParamCard label="KB Touch">{piano.kb_touch}</ParamCard>
        <ParamCard label="Model">{piano.model}</ParamCard>
        <ParamCard label="Octave Shift">
          {piano.octave_shift >= 0 ? `+${piano.octave_shift}` : piano.octave_shift}
        </ParamCard>
        <ParamCard label="Volume">
          <Bar value={piano.volume} />
        </ParamCard>
      </div>

      <p className="section-heading">Options</p>
      <div className="param-grid">
        <ParamCard label="Pitch Stick"><BoolChip on={piano.pitch_stick} /></ParamCard>
        <ParamCard label="Sustain Pedal"><BoolChip on={piano.sustain} /></ParamCard>
        <ParamCard label="Soft Release"><BoolChip on={piano.soft_release} /></ParamCard>
        <ParamCard label="String Resonance"><BoolChip on={piano.string_resonance} /></ParamCard>
        <ParamCard label="Pedal Noise"><BoolChip on={piano.pedal_noise} /></ParamCard>
      </div>
    </div>
  );
}

// ─── Organ section ─────────────────────────────────────────────────────────

function OrganSection({ organ }: { organ: OrganData }) {
  return (
    <div>
      <p className="section-heading">Organ Type</p>
      <div className="param-grid">
        <ParamCard label="Type">{organ.type}</ParamCard>
        <ParamCard label="Volume"><Bar value={organ.volume} /></ParamCard>
        <ParamCard label="Octave Shift">
          {organ.octave_shift >= 0 ? `+${organ.octave_shift}` : organ.octave_shift}
        </ParamCard>
        <ParamCard label="Sustain Pedal"><BoolChip on={organ.sustain} /></ParamCard>
        <ParamCard label="Live Mode"><BoolChip on={organ.live_mode} /></ParamCard>
      </div>

      <p className="section-heading">Drawbars — Preset 1</p>
      <DrawbarsDisplay values={organ.drawbars_1} label="Preset 1" />

      {organ.preset2_on && (
        <>
          <p className="section-heading">Drawbars — Preset 2</p>
          <DrawbarsDisplay values={organ.drawbars_2} label="Preset 2" />
        </>
      )}

      <p className="section-heading">Percussion &amp; Vibrato</p>
      <div className="param-grid">
        <ParamCard label="Vibrato"><BoolChip on={organ.vibrato_on} /></ParamCard>
        <ParamCard label="Vibrato Mode">{organ.vibrato_mode}</ParamCard>
        <ParamCard label="Percussion"><BoolChip on={organ.percussion_on} /></ParamCard>
        <ParamCard label="Harmonic 3rd"><BoolChip on={organ.harmonic_third} /></ParamCard>
        <ParamCard label="Decay Fast"><BoolChip on={organ.decay_fast} /></ParamCard>
        <ParamCard label="Volume Soft"><BoolChip on={organ.volume_soft} /></ParamCard>
      </div>
    </div>
  );
}

// ─── Synth section ─────────────────────────────────────────────────────────

function EnvelopeRow({ env, label }: { env: { attack: number; decay: number; release: number; velocity: boolean | number }; label: string }) {
  return (
    <div>
      <p className="section-heading">{label}</p>
      <div className="env-row">
        <ParamCard label="Attack"><Bar value={env.attack} /></ParamCard>
        <ParamCard label="Decay"><Bar value={env.decay} /></ParamCard>
        <ParamCard label="Release"><Bar value={env.release} /></ParamCard>
        <ParamCard label="Velocity">
          {typeof env.velocity === "boolean"
            ? <BoolChip on={env.velocity} />
            : <Bar value={env.velocity} />}
        </ParamCard>
      </div>
    </div>
  );
}

function SynthSection({ synth }: { synth: SynthData }) {
  return (
    <div>
      <p className="section-heading">Oscillator</p>
      <div className="param-grid">
        <ParamCard label="Osc Type">{synth.osc_type}</ParamCard>
        <ParamCard label="Voice Mode">{synth.voice_mode}</ParamCard>
        <ParamCard label="Unison">{synth.unison}</ParamCard>
        <ParamCard label="Vibrato">{synth.vibrato}</ParamCard>
        <ParamCard label="Glide"><Bar value={synth.glide} /></ParamCard>
        <ParamCard label="Octave Shift">
          {synth.octave_shift >= 0 ? `+${synth.octave_shift}` : synth.octave_shift}
        </ParamCard>
        <ParamCard label="Volume"><Bar value={synth.volume} /></ParamCard>
        <ParamCard label="Preset Name">{synth.preset_name || "—"}</ParamCard>
      </div>

      <p className="section-heading">LFO</p>
      <div className="param-grid">
        <ParamCard label="Wave">{synth.lfo_wave}</ParamCard>
        <ParamCard label="Rate">
          <Bar value={synth.lfo_rate} />
        </ParamCard>
        <ParamCard label="Master Clock"><BoolChip on={synth.lfo_master_clock} /></ParamCard>
      </div>

      <p className="section-heading">Filter</p>
      <div className="param-grid">
        <ParamCard label="Type">
          {synth.filter_type}
          <CCOverlay cc={74} />
        </ParamCard>
        <ParamCard label="Freq">
          <Bar value={synth.filter_freq} />
          <CCOverlay cc={74} />
        </ParamCard>
        <ParamCard label="Resonance">
          <Bar value={synth.filter_resonance} />
          <CCOverlay cc={71} />
        </ParamCard>
        <ParamCard label="KB Track">{synth.kb_track}</ParamCard>
        <ParamCard label="Drive">{synth.drive}</ParamCard>
      </div>

      <EnvelopeRow env={synth.mod_env} label="Mod Envelope" />
      <EnvelopeRow env={synth.amp_env} label="Amp Envelope" />

      {synth.arpeggiator.on && (
        <>
          <p className="section-heading">Arpeggiator</p>
          <div className="param-grid">
            <ParamCard label="Pattern">{synth.arpeggiator.pattern}</ParamCard>
            <ParamCard label="Range">{synth.arpeggiator.range}</ParamCard>
            <ParamCard label="Rate"><Bar value={synth.arpeggiator.rate} /></ParamCard>
            <ParamCard label="KB Sync"><BoolChip on={synth.arpeggiator.kb_sync} /></ParamCard>
            <ParamCard label="Master Clock"><BoolChip on={synth.arpeggiator.master_clock} /></ParamCard>
          </div>
        </>
      )}

      <p className="section-heading">Options</p>
      <div className="param-grid">
        <ParamCard label="Pitch Stick"><BoolChip on={synth.pitch_stick} /></ParamCard>
        <ParamCard label="Sustain Pedal"><BoolChip on={synth.sustain} /></ParamCard>
        <ParamCard label="Arpeggiator"><BoolChip on={synth.arpeggiator.on} /></ParamCard>
      </div>
    </div>
  );
}

// ─── Effects section ────────────────────────────────────────────────────────

function FxBlock({ title, on, type, params }: {
  title: string;
  on: boolean;
  type?: string;
  params: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <div className={`fx-block ${on ? "" : "off"}`}>
      <div className="fx-block-header">
        <BoolChip on={on} />
        <span className="fx-block-name">{title}</span>
        {type && <span className="fx-type-badge">{type}</span>}
      </div>
      {on && (
        <div className="fx-params">
          {params.map((p, i) => (
            <div key={i} className="fx-param">
              <div className="fx-param-label">{p.label}</div>
              <div className="fx-param-value">{p.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EffectsSection({ effects }: { effects: EffectsData }) {
  const { rotary, effect1, effect2, delay, reverb, amp_sim_eq, compressor } = effects;
  return (
    <div className="fx-chain">
      <FxBlock
        title="Rotary Speaker"
        on={rotary.on}
        params={[{ label: "Source", value: rotary.source }]}
      />
      <FxBlock
        title="Effect 1"
        on={effect1.on}
        type={effect1.type}
        params={[
          { label: "Source", value: effect1.source },
          { label: "Rate", value: <Bar value={effect1.rate} max={63} /> },
          { label: "Amount", value: <Bar value={effect1.amount} /> },
        ]}
      />
      <FxBlock
        title="Effect 2"
        on={effect2.on}
        type={effect2.type}
        params={[
          { label: "Source", value: effect2.source },
          { label: "Rate", value: <Bar value={effect2.rate} /> },
          { label: "Amount", value: <Bar value={effect2.amount} /> },
        ]}
      />
      <FxBlock
        title="Delay"
        on={delay.on}
        params={[
          { label: "Source", value: delay.source },
          { label: "Tempo", value: delay.master_clock ? "Master" : delay.tempo },
          { label: "Mix", value: <Bar value={delay.mix} /> },
          { label: "Feedback", value: <Bar value={delay.feedback} /> },
          { label: "Ping Pong", value: <BoolChip on={delay.ping_pong} /> },
          { label: "Analog Mode", value: <BoolChip on={delay.analog_mode} /> },
        ]}
      />
      <FxBlock
        title="Reverb"
        on={reverb.on}
        type={reverb.type}
        params={[
          { label: "Amount", value: <Bar value={reverb.amount} /> },
          { label: "Bright", value: <BoolChip on={reverb.bright} /> },
        ]}
      />
      <FxBlock
        title="Amp Sim / EQ"
        on={amp_sim_eq.on}
        type={amp_sim_eq.amp_type}
        params={[
          { label: "Treble", value: <Bar value={amp_sim_eq.treble} /> },
          { label: "Mid Res", value: <Bar value={amp_sim_eq.mid_res} /> },
          { label: "Bass Dry/Wet", value: <Bar value={amp_sim_eq.bass_dry_wet} /> },
          { label: "Mid Freq", value: <Bar value={amp_sim_eq.mid_filter_freq} /> },
        ]}
      />
      <FxBlock
        title="Compressor"
        on={compressor.on}
        params={[
          { label: "Amount", value: <Bar value={compressor.amount} /> },
          { label: "Fast", value: <BoolChip on={compressor.fast} /> },
        ]}
      />
    </div>
  );
}

// ─── Main PatchPanel ────────────────────────────────────────────────────────

type TabId = "piano" | "organ" | "synth" | "effects";

export function PatchPanel() {
  const { patch, filePath: _filePath, setPatch, sidecarReady: storeReady, sidecarError } = usePatchStore();
  const { currentProgram, currentBank } = usePatchStore();
  const [activeTab, setActiveTab] = useState<TabId>("piano");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auto-select the first enabled section when a new patch loads
  useEffect(() => {
    if (!patch) return;
    if (patch.piano.enabled) setActiveTab("piano");
    else if (patch.synth.enabled) setActiveTab("synth");
    else if (patch.organ.enabled) setActiveTab("organ");
    else setActiveTab("effects");
  }, [patch?.name]);

  async function handleLoad() {
    setLoadError(null);
    setLoading(true);
    try {
      const fp = await loadPatchFile();
      if (!fp) { setLoading(false); return; }
      const data = await parsePatchFromPath(fp);
      setPatch(data, fp);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const sidecarStatus = sidecarError ? "error" : storeReady ? "ready" : "starting";
  const sidecarLabel = sidecarError ? "Sidecar offline" : storeReady ? "Sidecar ready" : "Starting…";

  const tabsConfig: Array<{ id: TabId; label: string; enabled: boolean }> = [
    { id: "piano",   label: "Piano",   enabled: patch?.piano.enabled ?? false },
    { id: "organ",   label: "Organ",   enabled: patch?.organ.enabled ?? false },
    { id: "synth",   label: "Synth",   enabled: patch?.synth.enabled ?? false },
    { id: "effects", label: "Effects", enabled: true },
  ];

  return (
    <div className="patch-panel">
      {/* Header */}
      <div className="patch-header">
        <button
          className="patch-load-btn"
          onClick={handleLoad}
          disabled={loading || !storeReady}
          title={storeReady ? "Load .ns3fp file" : "Sidecar not ready"}
        >
          {loading ? "Loading…" : "Load Patch"}
        </button>

        {patch ? (
          <>
            <div className="patch-name">{patch.name || "(unnamed)"}</div>
            <div className="patch-meta">
              Bank {patch.bank} / Loc {patch.location} · v{patch.format_version}
            </div>
          </>
        ) : (
          <div className="patch-name" style={{ color: "#555" }}>No patch loaded</div>
        )}

        <div className={`sidecar-badge ${sidecarStatus}`}>
          <div className="sidecar-dot" />
          {sidecarLabel}
        </div>
      </div>

      {/* Program Change bar */}
      {(currentProgram !== null || currentBank !== null) && (
        <div className="program-change-bar">
          Nord sending:
          {currentBank !== null && <span>Bank {currentBank}</span>}
          {currentProgram !== null && <span>Program {currentProgram + 1}</span>}
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="program-change-bar" style={{ color: "#f44336" }}>
          Error: {loadError}
        </div>
      )}

      {/* No patch placeholder */}
      {!patch ? (
        <div className="patch-content">
          <div className="patch-placeholder">
            <div className="ph-icon">🎛</div>
            <h3>No Patch Loaded</h3>
            <p>
              Click <strong>Load Patch</strong> to open an .ns3fp file from your Nord Stage 3
              library. All settings — Piano, Organ, Synth, and Effects — will be displayed here.
            </p>
            {sidecarError && <p style={{ color: "#f44336" }}>{sidecarError}</p>}
          </div>
        </div>
      ) : (
        <>
          {/* Section tabs */}
          <div className="patch-tabs">
            {tabsConfig.map(({ id, label, enabled }) => (
              <button
                key={id}
                className={`patch-tab${activeTab === id ? " active" : ""}${enabled ? " enabled-indicator" : ""}`}
                onClick={() => setActiveTab(id)}
                title={enabled ? `${label} is enabled in this patch` : `${label} is off`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Section content */}
          <div className="patch-content">
            {activeTab === "piano" && <PianoSection piano={patch.piano} />}
            {activeTab === "organ" && <OrganSection organ={patch.organ} />}
            {activeTab === "synth" && <SynthSection synth={patch.synth} />}
            {activeTab === "effects" && <EffectsSection effects={patch.effects} />}
          </div>
        </>
      )}
    </div>
  );
}
