import { useState, useRef, useCallback } from "react";

/**
 * Uploader
 * --------
 * Accepts a .wav file via drag-and-drop or file picker.
 * Decodes it with the Web Audio API and passes:
 *   - audioUrl    → object URL for Waveform display
 *   - audioBuffer → decoded AudioBuffer for signal analysis
 *   - meta        → { dropHeight, surface, denomination }
 * up to the parent via props.
 */

const SURFACES      = ["Glass", "Tile", "Marble", "Wood", "Concrete"];
const DENOMINATIONS = [
  { value: "1",  label: "₱1  — Nickel-plated steel, 23mm" },
  { value: "5",  label: "₱5  — Nickel-plated steel, 27mm" },
  { value: "10", label: "₱10 — Nickel-plated steel, 25.5mm" },
  { value: "20", label: "₱20 — Bimetallic, 28mm" },
];

export default function Uploader({ onUpload, loading = false }) {
  const [dragging,     setDragging]     = useState(false);
  const [fileMeta,     setFileMeta]     = useState(null);
  const [error,        setError]        = useState(null);
  const [surface,      setSurface]      = useState("Glass");
  const [denomination, setDenomination] = useState("1");
  const inputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    setError(null);

    if (!file.name.toLowerCase().endsWith(".wav")) {
      setError("Only .wav files are supported.");
      return;
    }

    setFileMeta({
      name:    file.name,
      size:    (file.size / 1024).toFixed(1) + " KB",
    });

    // Send file + metadata to App → Flask
    onUpload?.(file, {
      dropHeight:   30,
      surface,
      denomination,
    });

  }, [onUpload, surface, denomination]);

  // ── Drag handlers ──
  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = ()  => setDragging(false);
  const handleDrop      = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── File picker ──
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  return (
    <div className="flex flex-col gap-4">

      {/* ── Denomination selector ── */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] text-[#7A7870] tracking-widest">
          DENOMINATION
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {DENOMINATIONS.map(({ value }) => (
            <button
              key={value}
              onClick={() => setDenomination(value)}
              className={`py-2.5 rounded-lg font-mono text-xs font-semibold tracking-wide
                          border transition-all duration-150
                          ${denomination === value
                            ? "bg-[#D4AF37] text-[#0A0A0B] border-[#D4AF37]"
                            : "bg-transparent text-[#7A7870] border-white/[0.07] hover:border-[rgba(212,175,55,0.4)] hover:text-[#E8E6E0]"
                          }`}
            >
              ₱{value}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-[#7A7870] mt-0.5">
          {DENOMINATIONS.find(d => d.value === denomination)?.label}
        </p>
      </div>

      {/* ── Experiment metadata ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-[#7A7870] tracking-widest">
            DROP HEIGHT
          </label>
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.07]"
            style={{ background: "#18181C" }}
          >
            <span className="font-mono text-sm text-[#D4AF37] font-semibold">30</span>
            <span className="font-mono text-[11px] text-[#7A7870]">cm · fixed</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-[#7A7870] tracking-widest">
            SURFACE
          </label>
          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            className="px-3 py-2 rounded-lg border border-white/[0.07] font-mono text-sm
                       text-[#E8E6E0] outline-none cursor-pointer"
            style={{ background: "#18181C" }}
          >
            {SURFACES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Drop zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer
          transition-all duration-200 select-none
          ${dragging
            ? "border-[#D4AF37] bg-[rgba(212,175,55,0.12)] scale-[1.01]"
            : "border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.05)] hover:bg-[rgba(212,175,55,0.09)] hover:border-[rgba(212,175,55,0.55)]"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className={`text-3xl transition-transform duration-200 ${dragging ? "scale-110" : ""}`}>
          {loading ? "⏳" : "🪙"}
        </div>

        <div className="text-center">
          <p className="text-sm text-[#A8A49C]">
            {loading
              ? "Analyzing…"
              : dragging
              ? "Release to upload"
              : <><span className="text-[#D4AF37] font-medium">Drop a .wav file</span> here</>
            }
          </p>
          {!loading && !dragging && (
            <p className="text-xs text-[#7A7870] mt-1">or click to browse</p>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-950/40 border border-red-800/40 px-3 py-2.5">
          <span className="text-red-400 text-sm">⚠</span>
          <p className="text-xs text-red-400 leading-relaxed">{error}</p>
        </div>
      )}

      {/* ── File metadata ── */}
      {fileMeta && !error && (
        <div className="flex flex-col gap-1.5">
          {[
            { label: "FILE", value: fileMeta.name, gold: false },
            { label: "SIZE", value: fileMeta.size, gold: true  },
          ].map(({ label, value, gold }) => (
            <div
              key={label}
              className="flex justify-between items-center px-3 py-2 rounded-lg"
              style={{ background: "#18181C" }}
            >
              <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">
                {label}
              </span>
              <span className={`font-mono text-[12px] truncate max-w-[65%] text-right
                                ${gold ? "text-[#D4AF37]" : "text-[#E8E6E0]"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Upload another file ── */}
      {fileMeta && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-2.5 rounded-lg font-mono text-xs tracking-widest text-[#7A7870]
                     border border-white/[0.07] bg-transparent hover:border-[rgba(212,175,55,0.3)]
                     hover:text-[#E8E6E0] transition-all duration-150"
        >
          ↺ UPLOAD ANOTHER FILE
        </button>
      )}

    </div>
  );
}