import { useState } from "react";
import Uploader from "./components/Uploader";
import Waveform from "./components/Waveform";
import FFTChart from "./components/FFTChart";
import DecayChart from "./components/DecayChart";
import Result from "./components/Result";
import Panel from "./components/Panel";

export default function App() {
  const [audioUrl, setAudioUrl] = useState(null);
  const [result, setResult] = useState(null);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E8E6E0] p-7"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 60% 40% at 70% 0%, rgba(212,175,55,0.05) 0%, transparent 60%),
          radial-gradient(ellipse 40% 30% at 10% 80%, rgba(212,175,55,0.03) 0%, transparent 50%)
        `
      }}
    >

      {/* ── HEADER ── */}
      <header className="flex items-end justify-between mb-8 pb-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-4">
          {/* Coin glyph */}
          <div
            className="w-11 h-11 rounded-full border border-[#D4AF37] flex items-center justify-center
                       text-[#D4AF37] font-mono text-lg"
            style={{ boxShadow: "0 0 20px rgba(212,175,55,0.2), inset 0 0 12px rgba(212,175,55,0.05)" }}
          >
            ₱
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
              Coin Authenticity Tester
            </h1>
            <p className="text-xs text-[#7A7870] font-mono tracking-widest uppercase mt-0.5">
              Acoustic Impulse · Frequency Analysis · v1.0
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#7A7870] tracking-widest
                        border border-white/[0.07] rounded-full px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
          System ready
        </div>
      </header>

      {/* ── DASHBOARD GRID ── */}
      <div className="grid gap-3.5"
        style={{ gridTemplateColumns: "320px 1fr 1fr", gridTemplateRows: "auto auto" }}
      >

        {/* 01 — Uploader (spans 2 rows) */}
        <div style={{ gridColumn: 1, gridRow: "1 / 3" }}>
          <Panel title="Input" index="01">
              <Uploader onRecorded={setAudioUrl} onResult={setResult}/>
          </Panel>
        </div>

        {/* 02 — Waveform */}
        <div style={{ gridColumn: "2 / 4", gridRow: 1 }}>
          <Panel title="Waveform" index="02">
            <Waveform audioUrl={audioUrl} />
          </Panel>
        </div>

        {/* 03 — FFT Spectrum */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <Panel title="FFT Spectrum" index="03">
            <FFTChart audioUrl={audioUrl} />
          </Panel>
        </div>

        {/* 04 — Decay Curve */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <Panel title="Decay Curve" index="04">
            <DecayChart audioUrl={audioUrl} />
          </Panel>
        </div>

        {/* 05 — Result (full width) */}
        <div style={{ gridColumn: "1 / 4" }}>
          <Panel title="Analysis Result" index="05">
            <Result data={result} />
          </Panel>
        </div>

      </div>
    </div>
  );
}