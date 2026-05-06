export default function Result({ data, meta }) {
  // empty state
  if (!data?.classification) {
    return (
      <div
        className="flex items-center justify-center py-6 rounded-lg"
        style={{ background: "#18181C" }}
      >
        <p className="font-mono text-xs text-[#7A7870]">
          Load a .wav file to see the analysis result…
        </p>
      </div>
    );
  }

  const verdict = data.classification.verdict;

  const confidence = data.classification.confidence;

  const f0 = data.f0;

  const alpha = data.alpha;

  const Q = data.Q;

  const verdictConfig = {
    GENUINE: {
      color: "#4ADE80",
      bg: "rgba(74,222,128,0.07)",
      border: "rgba(74,222,128,0.25)",
      icon: "✅",
    },

    SUSPECT: {
      color: "#FCD34D",
      bg: "rgba(252,211,77,0.07)",
      border: "rgba(252,211,77,0.25)",
      icon: "⚠️",
    },

    COUNTERFEIT: {
      color: "#F87171",
      bg: "rgba(248,113,113,0.07)",
      border: "rgba(248,113,113,0.25)",
      icon: "❌",
    },
  };

  const vc = verdictConfig[verdict] ?? verdictConfig.SUSPECT;

  const metrics = [
    {
      label: "DOMINANT FREQ",
      value: parseFloat(f0).toFixed(1),
      unit: "Hz · f₀",
      gold: true,
    },

    {
      label: "DECAY RATE α",
      value: parseFloat(alpha).toFixed(4),
      unit: "s⁻¹",
      gold: false,
    },

    {
      label: "Q-FACTOR",
      value: parseFloat(Q).toFixed(1),
      unit: "dimensionless",
      gold: true,
    },
  ];

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "1fr 1fr 1fr 1.6fr",
      }}
    >
      {/* metrics */}
      {metrics.map(({ label, value, unit, gold }) => (
        <div
          key={label}
          className="flex flex-col gap-1 rounded-xl px-4 py-3"
          style={{ background: "#18181C" }}
        >
          <span className="font-mono text-[10px] text-[#7A7870] tracking-widest">
            {label}
          </span>

          <span
            className="font-bold text-2xl tracking-tight"
            style={{
              fontFamily: "'Syne', sans-serif",
              color: gold ? "#D4AF37" : "#E8E6E0",
            }}
          >
            {value}
          </span>

          <span className="font-mono text-[10px] text-[#7A7870]">{unit}</span>
        </div>
      ))}

      {/* verdict */}
      <div
        className="flex items-center gap-4 rounded-xl px-5 py-3 border"
        style={{
          background: vc.bg,
          borderColor: vc.border,
        }}
      >
        <span className="text-3xl">{vc.icon}</span>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-[#7A7870] tracking-widest uppercase">
            Verdict
          </span>

          <span
            className="font-bold text-xl tracking-tight"
            style={{
              fontFamily: "'Syne', sans-serif",
              color: vc.color,
            }}
          >
            {verdict}
          </span>

          <span className="font-mono text-[10px] text-[#7A7870]">
            {confidence}% confidence
          </span>

          {meta && (
            <span className="font-mono text-[10px] text-[#7A7870] opacity-70">
              {meta.dropHeight}cm drop · {meta.surface} surface
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
