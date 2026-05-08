import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";

/**
 * FFTChart
 * --------
 * Receives the `fft` object from the Flask /analyze response.
 * No signal processing here — purely a display component.
 *
 * Expected fft shape:
 *   freqs        : number[]  — frequency axis in Hz
 *   magnitudes_db: number[]  — magnitude in dB
 *   f0           : number    — dominant frequency in Hz
 *   f0_bin       : number    — bin index of f0
 */
export default function FFTChart({ fft }) {

  // ── Empty state ──
  if (!fft) {
    return (
      <div
        className="flex items-center justify-center h-28 rounded-lg"
        style={{ background: "#18181C" }}
      >
        <p className="font-mono text-xs text-[#7A7870] animate-pulse">Awaiting analysis…</p>
      </div>
    );
  }

  const { freqs, magnitudes_db, f0 } = fft;

  // Downsample to max 300 points and cap at 8 kHz for performance
  const chartData = useMemo(() => {
    const maxFreq = 8000;
    const data    = [];

    for (let i = 0; i < freqs.length; i += 8) {
      if (freqs[i] > maxFreq) break;
      data.push({
        freq: parseFloat(freqs[i].toFixed(1)),
        mag:  parseFloat(Math.max(-80, magnitudes_db[i]).toFixed(2)),
      });
    }

    return data;
  }, [freqs, magnitudes_db]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border border-white/[0.07] px-3 py-2 text-xs font-mono"
        style={{ background: "#111113" }}
      >
        <p className="text-[#D4AF37]">{payload[0]?.payload?.freq} Hz</p>
        <p className="text-[#A8A49C]">{payload[0]?.value} dB</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">

      {/* f₀ readout */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">
          DOMINANT FREQ
        </span>
        <span className="font-mono text-sm font-semibold text-[#D4AF37]">
          f₀ = {f0.toFixed(1)} Hz
        </span>
      </div>

      {/* Spectrum chart */}
      <div className="rounded-lg overflow-hidden" style={{ background: "#18181C" }}>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#D4AF37" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

            <XAxis
              dataKey="freq"
              tick={{ fontSize: 9, fill: "#7A7870", fontFamily: "monospace" }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[-80, 0]}
              tick={{ fontSize: 9, fill: "#7A7870", fontFamily: "monospace" }}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* f₀ marker */}
            <ReferenceLine
              x={parseFloat(f0.toFixed(1))}
              stroke="#F0CE5E"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{
                value: "f₀", position: "top",
                fill: "#F0CE5E", fontSize: 10, fontFamily: "monospace",
              }}
            />

            <Area
              type="monotone"
              dataKey="mag"
              stroke="#D4AF37"
              strokeWidth={1.5}
              fill="url(#specGrad)"
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Axis labels */}
      <div className="flex justify-between font-mono text-[10px] text-[#7A7870] px-1">
        <span>0 Hz</span>
        <span>Frequency</span>
        <span>8 kHz</span>
      </div>

    </div>
  );
}