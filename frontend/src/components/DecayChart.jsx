import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

/**
 * DecayChart
 * ----------
 * Receives the `decay` object and `Q` from the Flask /analyze response.
 * No signal processing here — purely a display component.
 *
 * Expected decay shape:
 *   times   : number[]  — time axis in seconds
 *   envelope: number[]  — normalized RMS envelope (0–1)
 *   fit     : number[]  — fitted A·e^(−αt) curve (normalized)
 *   alpha   : number    — decay constant s⁻¹
 *   A       : number    — fitted amplitude
 */
export default function DecayChart({ decay, Q }) {

  // ── Empty state ──
  if (!decay) {
    return (
      <div
        className="flex items-center justify-center h-28 rounded-lg"
        style={{ background: "#18181C" }}
      >
        <p className="font-mono text-xs text-[#7A7870] animate-pulse">Awaiting analysis…</p>
      </div>
    );
  }

  const { envelope, fit, alpha, times } = decay;

  // Convert to chart-friendly format — time in ms, normalized values
  const chartData = useMemo(() => {
    const maxEnv = Math.max(...envelope);
    return envelope.map((v, i) => ({
      time:   parseFloat(((times?.[i] ?? i / envelope.length * 0.5) * 1000).toFixed(1)),
      raw:    parseFloat((v   / maxEnv).toFixed(4)),
      fitted: parseFloat((fit[i] / maxEnv).toFixed(4)),
    }));
  }, [envelope, fit, times]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border border-white/[0.07] px-3 py-2 text-xs font-mono"
        style={{ background: "#111113" }}
      >
        <p className="text-[#A8A49C]">{payload[0]?.payload?.time} ms</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">
          DECAY FIT
        </span>
        <div className="flex gap-4">
          <span className="font-mono text-xs text-[#A8A49C]">
            α = <span className="text-[#D4AF37]">{alpha.toFixed(4)}</span> s⁻¹
          </span>
          <span className="font-mono text-xs text-[#A8A49C]">
            Q = <span className="text-[#D4AF37]">{(Q ?? 0).toFixed(1)}</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg overflow-hidden" style={{ background: "#18181C" }}>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: "#7A7870", fontFamily: "monospace" }}
              tickFormatter={(v) => `${v}ms`}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 9, fill: "#7A7870", fontFamily: "monospace" }}
            />

            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace", color: "#7A7870" }} />

            {/* Raw envelope */}
            <Line
              type="monotone"
              dataKey="raw"
              name="Envelope"
              stroke="#D4AF37"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />

            {/* Fitted curve */}
            <Line
              type="monotone"
              dataKey="fitted"
              name="A·e^(−αt)"
              stroke="#F0CE5E"
              strokeWidth={1}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={true}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Axis labels */}
      <div className="flex justify-between font-mono text-[10px] text-[#7A7870] px-1">
        <span>0 ms</span>
        <span>Time after onset</span>
        <span>500 ms</span>
      </div>

    </div>
  );
}