import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  detectOnset,
  applyHanningWindow,
  computeFFT,
  findPeakFrequency,
} from "../utils/signalProcessing";

const RING_DURATION_S = 0.5; // analyse 500ms after onset

/**
 * FFTChart
 * --------
 * 1. Extracts the ring segment (onset → onset + 500ms) from audioBuffer
 * 2. Applies Hanning window
 * 3. Computes FFT magnitude spectrum
 * 4. Finds dominant frequency f₀
 * 5. Renders spectrum as an area chart, highlights f₀ peak
 * Calls onResult({ f0, alpha:null }) so App can start building the result.
 */
export default function FFTChart({ audioBuffer, onResult }) {
  const [chartData, setChartData]   = useState([]);
  const [peakFreq,  setPeakFreq]    = useState(null);
  const [error,     setError]       = useState(null);

  useEffect(() => {
    if (!audioBuffer) { setChartData([]); setPeakFreq(null); return; }

    try {
      const sampleRate  = audioBuffer.sampleRate;
      const samples     = audioBuffer.getChannelData(0);
      const onsetIndex  = detectOnset(samples, sampleRate);

      // Slice ring segment
      const ringLength  = Math.floor(RING_DURATION_S * sampleRate);
      const ringEnd     = Math.min(onsetIndex + ringLength, samples.length);
      const ring        = samples.slice(onsetIndex, ringEnd);

      // Window + FFT
      const windowed    = applyHanningWindow(ring);
      const { magnitudes, fftSize } = computeFFT(windowed);

      // Peak frequency
      const { f0, binIndex } = findPeakFrequency(magnitudes, sampleRate, fftSize);
      setPeakFreq(f0);

      // Build chart data — downsample to 300 points for performance
      const binRes    = sampleRate / fftSize;
      const maxBin    = Math.floor(8000 / binRes); // show 0–8 kHz
      const step      = Math.max(1, Math.floor(maxBin / 300));
      const data      = [];

      for (let i = 0; i < maxBin; i += step) {
        const freq    = i * binRes;
        const mag     = magnitudes[i] ?? 0;
        const magDb   = mag > 0 ? 20 * Math.log10(mag) : -80;
        data.push({
          freq:   parseFloat(freq.toFixed(1)),
          mag:    parseFloat(Math.max(-80, magDb).toFixed(2)),
          isPeak: i === binIndex,
        });
      }

      setChartData(data);
      setError(null);

      // Bubble f0 up to App (alpha filled in by DecayChart)
      onResult?.((prev) => ({ ...prev, f0 }));
    } catch (err) {
      console.error("FFT error:", err);
      setError("FFT computation failed.");
    }
  }, [audioBuffer]);

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
        <p className="text-[#D4AF37]">{payload[0]?.payload?.freq} Hz</p>
        <p className="text-[#A8A49C]">{payload[0]?.value} dB</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* f₀ readout */}
      {peakFreq && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">DOMINANT FREQ</span>
          <span className="font-mono text-sm font-semibold text-[#D4AF37]">
            f₀ = {peakFreq.toFixed(1)} Hz
          </span>
        </div>
      )}

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
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* f₀ peak reference line */}
            {peakFreq && (
              <ReferenceLine
                x={parseFloat(peakFreq.toFixed(1))}
                stroke="#F0CE5E"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: "f₀", position: "top", fill: "#F0CE5E", fontSize: 10, fontFamily: "monospace" }}
              />
            )}

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