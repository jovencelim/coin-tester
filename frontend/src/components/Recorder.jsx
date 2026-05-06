import { useState, useRef, useCallback } from "react";

/**
 * Recorder
 * --------
 * Accepts a .wav file via drag-and-drop or file picker.
 * Decodes it with the Web Audio API and passes:
 *   - audioUrl     → object URL for Waveform playback
 *   - audioBuffer  → decoded AudioBuffer for FFT / analysis
 * up to the parent via props.
 */
const SURFACES = ["Glass", "Tile", "Marble", "Wood", "Concrete"];

export default function Recorder({ onRecorded, onBuffer }) {
  const [dragging,    setDragging]    = useState(false);
  const [fileMeta,    setFileMeta]    = useState(null);
  const [error,       setError]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [dropHeight,  setDropHeight]  = useState(30);
  const [surface,     setSurface]     = useState("Glass");
  const inputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    setError(null);

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".wav")) {
      setError("Only .wav files are supported.");
      return;
    }

    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Decode audio using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Build an object URL for Waveform / playback components
      const blob = new Blob([arrayBuffer], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(blob);

      // Surface metadata for display
      setFileMeta({
        name: file.name,
        duration: audioBuffer.duration.toFixed(2),
        sampleRate: audioBuffer.sampleRate.toLocaleString(),
        channels: audioBuffer.numberOfChannels,
        samples: audioBuffer.length.toLocaleString(),
      });

      // Pass data up to App — include experiment metadata
      onRecorded?.(audioUrl);
      onBuffer?.(audioBuffer, { dropHeight: Number(dropHeight), surface });
    } catch (err) {
      setError("Could not decode audio. Make sure the file is a valid .wav.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onRecorded, onBuffer]);

  // ── Drag handlers ──
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── File picker ──
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Experiment metadata */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-[#7A7870] tracking-widest">DROP HEIGHT</label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.07]"
            style={{ background: "#18181C" }}>
            <input
              type="number"
              min={10} max={100} step={5}
              value={dropHeight}
              onChange={(e) => setDropHeight(e.target.value)}
              className="w-full bg-transparent font-mono text-sm text-[#E8E6E0] outline-none"
            />
            <span className="font-mono text-[11px] text-[#7A7870] shrink-0">cm</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] text-[#7A7870] tracking-widest">SURFACE</label>
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

      {/* Drop zone */}
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
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Icon */}
        <div className={`text-3xl transition-transform duration-200 ${dragging ? "scale-110" : ""}`}>
          {loading ? "⏳" : "🪙"}
        </div>

        <div className="text-center">
          <p className="text-sm text-[#A8A49C]">
            {loading
              ? "Decoding audio…"
              : dragging
              ? "Release to load"
              : <><span className="text-[#D4AF37] font-medium">Drop a .wav file</span> here</>
            }
          </p>
          {!loading && !dragging && (
            <p className="text-xs text-[#7A7870] mt-1">or click to browse</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-950/40 border border-red-800/40 px-3 py-2.5">
          <span className="text-red-400 text-sm">⚠</span>
          <p className="text-xs text-red-400 leading-relaxed">{error}</p>
        </div>
      )}

      {/* File metadata — shown after successful load */}
      {fileMeta && !error && (
        <div className="flex flex-col gap-1.5">
          {[
            { label: "FILE",        value: fileMeta.name,       gold: false },
            { label: "DURATION",    value: `${fileMeta.duration} s`, gold: true },
            { label: "SAMPLE RATE", value: `${fileMeta.sampleRate} Hz`, gold: false },
            { label: "CHANNELS",    value: fileMeta.channels,   gold: false },
            { label: "SAMPLES",     value: fileMeta.samples,    gold: true },
          ].map(({ label, value, gold }) => (
            <div
              key={label}
              className="flex justify-between items-center px-3 py-2 rounded-lg"
              style={{ background: "#18181C" }}
            >
              <span className="font-mono text-[11px] text-[#7A7870] tracking-widest">{label}</span>
              <span className={`font-mono text-[12px] truncate max-w-[55%] text-right ${gold ? "text-[#D4AF37]" : "text-[#E8E6E0]"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Replace file button */}
      {fileMeta && (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-2.5 rounded-lg font-mono text-xs tracking-widest text-[#7A7870]
                     border border-white/[0.07] bg-transparent hover:border-[rgba(212,175,55,0.3)]
                     hover:text-[#E8E6E0] transition-all duration-150"
        >
          ↺ LOAD ANOTHER FILE
        </button>
      )}
    </div>
  );
}