/**
 * Result
 * ------
 * Displays the analysis result returned directly from the Flask backend.
 * Classification (verdict, confidence, coin_label) is computed server-side
 * in coin_signal.py — this component only renders what it receives.
 *
 * Expected shape of `data` prop (from /analyze response):
 *   f0          : number   — dominant frequency in Hz
 *   alpha       : number   — decay constant s⁻¹
 *   Q           : number   — Q-factor
 *   verdict     : string   — "Genuine" | "Suspect" | "Counterfeit"
 *   confidence  : number   — 0–100
 *   coin_label  : string   — e.g. "₱5 NGC"
 *   r_squared   : number   — decay fit quality 0–1
 *   meta        : object   — { surface, denomination, drop_height }
 */

const VERDICT_CONFIG = {
  Genuine:     { color: "#4ADE80", bg: "rgba(74,222,128,0.07)",  border: "rgba(74,222,128,0.25)",  icon: "✅" },
  Suspect:     { color: "#FCD34D", bg: "rgba(252,211,77,0.07)",  border: "rgba(252,211,77,0.25)",  icon: "⚠️" },
  Counterfeit: { color: "#F87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)", icon: "❌" },
};

export default function Result({ data }) {

  // ── Empty state ──
  if (!data?.verdict) {
    return (
      <div
        className="flex items-center justify-center py-6 rounded-lg"
        style={{ background: "#18181C" }}
      >
        <p className="font-mono text-xs text-[#7A7870]">
          Upload a .wav file to see the analysis result…
        </p>
      </div>
    );
  }

  const {
    f0, alpha, Q,
    verdict, confidence, coin_label,
    r_squared,
    meta,
  } = data;

  const vc = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.Suspect;

  const metrics = [
    { label: "DOMINANT FREQ", value: parseFloat(f0).toLocaleString(),  unit: "Hz · f₀",      gold: true  },
    { label: "DECAY RATE α",  value: parseFloat(alpha).toFixed(3),     unit: "s⁻¹",          gold: false },
    { label: "Q-FACTOR",      value: parseInt(Q).toLocaleString(),     unit: "dimensionless", gold: true  },
    { label: "FIT QUALITY",   value: parseFloat(r_squared).toFixed(3), unit: "R²",            gold: false },
  ];

  return (
    <div className="flex flex-col gap-3">

      {/* ── Metric cards ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
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
              style={{ fontFamily: "'Syne', sans-serif", color: gold ? "#D4AF37" : "#E8E6E0" }}
            >
              {value}
            </span>
            <span className="font-mono text-[10px] text-[#7A7870]">{unit}</span>
          </div>
        ))}
      </div>

      {/* ── Verdict ── */}
      <div
        className="flex items-center gap-4 rounded-xl px-5 py-4 border"
        style={{ background: vc.bg, borderColor: vc.border }}
      >
        <span className="text-4xl">{vc.icon}</span>
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="font-mono text-[10px] text-[#7A7870] tracking-widest uppercase">
            Verdict
          </span>
          <span
            className="font-bold text-2xl tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif", color: vc.color }}
          >
            {verdict.toUpperCase()}
          </span>
          <span className="font-mono text-[11px] text-[#7A7870]">
            {confidence}% confidence · {coin_label}
          </span>
          {meta && (
            <span className="font-mono text-[10px] text-[#7A7870] opacity-60 mt-0.5">
              30cm drop · {meta.surface} surface · ₱{meta.denomination} NGC
            </span>
          )}
        </div>

        {/* Low R² warning */}
        {r_squared < 0.85 && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="font-mono text-[10px] text-[#FCD34D]">⚠ Low R²</span>
            <span className="font-mono text-[10px] text-[#7A7870] text-right">
              Noisy recording<br/>or double impact
            </span>
          </div>
        )}
      </div>

    </div>
  );
}