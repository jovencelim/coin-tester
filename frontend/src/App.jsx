import { useState } from "react";
import Uploader   from "./components/Uploader";
import Waveform   from "./components/Waveform";
import FFTChart   from "./components/FFTChart";
import DecayChart from "./components/DecayChart";
import Result     from "./components/Result";
import Panel      from "./components/Panel";

const BACKEND_URL = "http://localhost:5000";

/**
 * App
 * ---
 * Data flow:
 *   1. Uploader   → user picks a .wav file + selects denomination + surface
 *   2. App        → POSTs the file + metadata to Flask /analyze
 *   3. Flask      → runs full DSP pipeline, returns JSON result
 *   4. App        → distributes result to all display components:
 *        Waveform   ← result.waveform  { samples, sample_rate, onset_index }
 *        FFTChart   ← result.fft       { freqs, magnitudes_db, f0, f0_bin }
 *        DecayChart ← result.decay     { times, envelope, fit, alpha, A }
 *                     result.Q
 *        Result     ← result           (full object)
 */
export default function App() {
  const [result,   setResult]   = useState(null);   // full backend response
  const [loading,  setLoading]  = useState(false);  // waiting for Flask
  const [error,    setError]    = useState(null);   // network / server errors

  // Called by Uploader when a valid .wav is selected
  // file   : File object
  // meta   : { dropHeight, surface, denomination }
  const handleUpload = async (file, meta) => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file",         file);
      formData.append("dropHeight",   meta.dropHeight);
      formData.append("surface",      meta.surface);
      formData.append("denomination", meta.denomination);

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body:   formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const data = await response.json();
      setResult(data);

    } catch (err) {
      if (err.message.includes("fetch")) {
        setError("Cannot reach the backend. Make sure Flask is running on localhost:5000.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = loading
    ? "Analyzing…"
    : result
    ? "Analysis complete"
    : "System ready";

  return (
    <div
      className="min-h-screen bg-[#0A0A0B] text-[#E8E6E0] p-7"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 60% 40% at 70% 0%, rgba(212,175,55,0.05) 0%, transparent 60%),
          radial-gradient(ellipse 40% 30% at 10% 80%, rgba(212,175,55,0.03) 0%, transparent 50%)
        `,
      }}
    >
      {/* ── HEADER ── */}
      <header className="flex items-end justify-between mb-8 pb-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-full border border-[#D4AF37] flex items-center
                       justify-center text-[#D4AF37] font-mono text-lg"
            style={{ boxShadow: "0 0 20px rgba(212,175,55,0.2), inset 0 0 12px rgba(212,175,55,0.05)" }}
          >
            ₱
          </div>
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Coin Authenticity Tester
            </h1>
            <p className="text-xs text-[#7A7870] font-mono tracking-widest uppercase mt-0.5">
              Acoustic Impulse · Frequency Analysis · v1.0
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#7A7870]
                        tracking-widest border border-white/[0.07] rounded-full px-3 py-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            loading ? "bg-[#D4AF37] animate-pulse" :
            result  ? "bg-green-400 shadow-[0_0_6px_#4ade80]" :
                      "bg-green-400 animate-pulse"
          }`} />
          {statusLabel}
        </div>
      </header>

      {/* ── NETWORK ERROR ── */}
      {error && (
        <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl
                        border border-red-800/40 bg-red-950/30">
          <p className="text-sm text-red-400 font-mono">{error}</p>
        </div>
      )}

      {/* ── DASHBOARD GRID ── */}
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "320px 1fr 1fr", gridTemplateRows: "auto auto" }}
      >
        {/* 01 — Uploader */}
        <div style={{ gridColumn: 1, gridRow: "1 / 3" }}>
          <Panel title="Input" index="01">
            <Uploader onUpload={handleUpload} loading={loading} />
          </Panel>
        </div>

        {/* 02 — Waveform */}
        <div style={{ gridColumn: "2 / 4", gridRow: 1 }}>
          <Panel title="Waveform" index="02">
            <Waveform
              waveform={result?.waveform?.samples}
              onset={result?.waveform?.onset_index}
            />
          </Panel>
        </div>

        {/* 03 — FFT Spectrum */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <Panel title="FFT Spectrum" index="03">
            <FFTChart fft={result?.fft} />
          </Panel>
        </div>

        {/* 04 — Decay Curve */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <Panel title="Decay Curve" index="04">
            <DecayChart decay={result?.decay} Q={result?.Q} />
          </Panel>
        </div>

        {/* 05 — Result */}
        <div style={{ gridColumn: "1 / 4" }}>
          <Panel title="Analysis Result" index="05">
            <Result data={result} />
          </Panel>
        </div>
      </div>
    </div>
  );
}