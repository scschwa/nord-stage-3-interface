import { ParsedParameter, SECTION_META } from "../../lib/ai/paramParser";

interface Props {
  param: ParsedParameter;
}

export function ParameterCard({ param }: Props) {
  const meta = SECTION_META[param.section] ?? { label: param.section, color: "#555" };

  return (
    <div className="param-card-ai">
      <div className="param-card-header">
        <span
          className="section-badge"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>

        <div className="param-name-knob">
          {param.name}
          {param.knob && param.knob !== param.name && (
            <span className="param-knob-label"> · {param.knob}</span>
          )}
        </div>

        <div className="param-value-badge">{param.value}</div>
      </div>

      <div className="param-card-body">
        {param.location && (
          <div className="param-location">{param.location}</div>
        )}
        {param.range && (
          <div className="param-location" style={{ opacity: 0.7 }}>
            Range: {param.range}
          </div>
        )}
        {param.rationale && (
          <div className="param-rationale">{param.rationale}</div>
        )}
      </div>
    </div>
  );
}
