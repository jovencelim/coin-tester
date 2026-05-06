import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  detectOnset,
  computeRMSEnvelope,
  fitExponentialDecay,
  computeQFactor,
} from "../utils/signalProcessing";

const RING_DURATION_S = 0.5;

/**
 * DecayChart
 * ----------
 * 1. Extracts ring segment from audioBuffer
 * 2. Computes RMS amplitude envelope
 * 3. Fits A·e^(−α·t) via log-linear regression
 * 4. Computes Q-factor from f₀ (passed via result prop)
 * 5. Renders raw envelope + fitted curve as overlaid line chart
 * Calls onResult to merge { alpha, Q } into App state.
 */
export default function DecayChart({ audioBuffer, result, onResult }) {
  const [chartData, setChartData] = useState([]);
  const [metrics,   setMetrics]   = useState(null);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!audioBuffer) { setChartData([]); setMetrics(null); return; }

    try {
      const sampleRate = audioBuffer.sampleRate;
      const samples    = audioBuffer.getChannelData(0);
      const onsetIdx   = detectOnset(samples, sampleRate);

      // Ring segment
      const ringLen    = Math.floor(RING_DURATION_S * sampleRate);
      const ring       = samples.slice(onsetIdx, Math.min(onsetIdx + ringLen, samples.length));

      // RMS envelope
      const { envelope, times } = computeRMSEnvelope(ring, sampleRate, 256);

      // Exponential decay fit
      const { alpha, A, fitted } = fitExponentialDecay(envelope, times);

      // Q-factor (needs f₀ from FFTChart — use result prop if available)
      const f0 = result?.f0 ?? 3000; // fallback to typical value
      const Q  = computeQFactor(f0, alpha);

      setMetrics({ alpha, A, Q });
      setError(null);

      // Bubble up to App
      onResult?.((prev) => ({ ...prev, alpha, Q }));

      // Build chart — normalize envelope to 0–1 for cleaner display
      const maxEnv = Math.max(...envelope);
      const data   = Array.from({ length: envelope.length }, (_, i) => ({
        time:    parseFloat((times[i] * 1000).toFixed(1)), // ms
        raw:     parseFloat((envelope[i] / maxEnv).toFixed(4)),
        fitted:  parseFloat((fitted[i]   / maxEnv).toFixed(4)),
      }));

      setChartData(data);
    } catch (err) {
      console.error("Decay fit error:", err);
      setError("Decay computation failed.");
    }
  }, [audioBuffer, result?.f0]);

  // ── Empty state ──
  if (!audioBuffer) {
    return (
      <div className="flex items-center justify-center h-28 rounded-lg"
        style={{ background: "#18181C" }}>
        <p className="font-mono text-xs text-[#7A7870]">Awaiting audio input…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-28 rounded-lg bg-red-950/30 border border-red-800/30">
        <p className="font-mono text-xs text-red-400">{error}</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-white/[0.07] px-3 py-2 text-xs font-mono"
        style={{ background: "#111113" }}>
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
      {metrics && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">DECAY FIT</span>
          <div className="flex gap-4">
            <span className="font-mono text-xs text-[#A8A49C]">
              α = <span className="text-[#D4AF37]">{metrics.alpha.toFixed(2)}</span> s⁻¹
            </span>
            <span className="font-mono text-xs text-[#A8A49C]">
              Q = <span className="text-[#D4AF37]">{metrics.Q.toFixed(0)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Decay chart */}
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
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "10px", fontFamily: "monospace", color: "#7A7870" }}
            />

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