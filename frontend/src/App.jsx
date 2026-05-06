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

  const [expMeta, setExpMeta] = useState(null);

  return (
    <div
      className="
        min-h-screen
        bg-[#0A0A0B]
        text-[#E8E6E0]
        p-7
      "
      style={{
        backgroundImage: `
          radial-gradient(
            ellipse 60% 40% at 70% 0%,
            rgba(212,175,55,0.05) 0%,
            transparent 60%
          ),

          radial-gradient(
            ellipse 40% 30% at 10% 80%,
            rgba(212,175,55,0.03) 0%,
            transparent 50%
          )
        `,
      }}
    >
      {/* HEADER */}
      <header
        className="
          flex
          items-end
          justify-between
          mb-8
          pb-5
          border-b
          border-white/[0.07]
        "
      >
        <div className="flex items-center gap-4">
          <div
            className="
              w-11
              h-11
              rounded-full
              border
              border-[#D4AF37]
              flex
              items-center
              justify-center
              text-[#D4AF37]
              font-mono
              text-lg
            "
            style={{
              boxShadow: `
                0 0 20px rgba(212,175,55,0.2),
                inset 0 0 12px rgba(212,175,55,0.05)
              `,
            }}
          >
            ₱
          </div>

          <div>
            <h1
              className="
                text-xl
                font-bold
                tracking-tight
              "
              style={{
                fontFamily: "'Syne', sans-serif",
              }}
            >
              Coin Authenticity Tester
            </h1>

            <p
              className="
                text-xs
                text-[#7A7870]
                font-mono
                tracking-widest
                uppercase
                mt-0.5
              "
            >
              Acoustic Impulse · Frequency Analysis · v1.0
            </p>
          </div>
        </div>

        <div
          className="
            flex
            items-center
            gap-2
            text-[11px]
            font-mono
            text-[#7A7870]
            tracking-widest
            border
            border-white/[0.07]
            rounded-full
            px-3
            py-1.5
          "
        >
          <span
            className="
              w-1.5
              h-1.5
              rounded-full
              bg-green-400
              shadow-[0_0_6px_#4ade80]
              animate-pulse
            "
          />

          {result ? "Analysis complete" : "System ready"}
        </div>
      </header>

      {/* DASHBOARD */}
      <div
        className="grid gap-3.5"
        style={{
          gridTemplateColumns: "320px 1fr 1fr",

          gridTemplateRows: "auto auto",
        }}
      >
        {/* INPUT */}
        <div
          style={{
            gridColumn: 1,
            gridRow: "1 / 3",
          }}
        >
          <Panel title="Input" index="01">
            <Uploader
              onRecorded={setAudioUrl}
              onResult={(res) => {
                setResult(res);

                setExpMeta(res.metadata ?? null);
              }}
            />
          </Panel>
        </div>

        {/* WAVEFORM */}
        <div
          style={{
            gridColumn: "2 / 4",
            gridRow: 1,
          }}
        >
          <Panel title="Waveform" index="02">
            <Waveform waveform={result?.waveform} onset={result?.onset} />
          </Panel>
        </div>

        {/* FFT */}
        <div
          style={{
            gridColumn: 2,
            gridRow: 2,
          }}
        >
          <Panel title="FFT Spectrum" index="03">
            <FFTChart fft={result?.fft} />
          </Panel>
        </div>

        {/* DECAY */}
        <div
          style={{
            gridColumn: 3,
            gridRow: 2,
          }}
        >
          <Panel title="Decay Curve" index="04">
            <DecayChart decay={result?.decay} Q={result?.Q} />
          </Panel>
        </div>

        {/* RESULT */}
        <div
          style={{
            gridColumn: "1 / 4",
          }}
        >
          <Panel title="Analysis Result" index="05">
            <Result data={result} meta={expMeta} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
