import { useState, useRef } from "react";
import { analyzeAudio } from "../services/api";

const SURFACES = ["Tile", "Wood", "Concrete"];

export default function Uploader({ onResult }) {
  const [dragging, setDragging] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  const [fileMeta, setFileMeta] = useState(null);

  const [dropHeight, setDropHeight] = useState(30);

  const [surface, setSurface] = useState("Tile");

  const inputRef = useRef(null);

  async function processFile(file) {
    setError(null);

    if (!file.name.toLowerCase().endsWith(".wav")) {
      setError("Only WAV files are supported.");

      return;
    }

    try {
      setLoading(true);

      // Flask backend analysis
      const result = await analyzeAudio(file);

      onResult?.({
        ...result,

        metadata: {
          dropHeight,
          surface,
        },
      });

      setFileMeta({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + " KB",
      });
    } catch (err) {
      console.error(err);

      setError(err.message || "Backend analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];

    if (file) processFile(file);

    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();

    setDragging(false);

    const file = e.dataTransfer.files?.[0];

    if (file) processFile(file);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* metadata */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#7A7870]">
            DROP HEIGHT
          </label>

          <select
            value={dropHeight}
            onChange={(e) => setDropHeight(Number(e.target.value))}
            className="
              bg-[#18181C]
              border
              border-white/10
              rounded-lg
              px-3
              py-2
              text-sm
            "
          >
            <option value={20}>20 cm</option>

            <option value={30}>30 cm</option>

            <option value={40}>40 cm</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#7A7870]">SURFACE</label>

          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            className="
              bg-[#18181C]
              border
              border-white/10
              rounded-lg
              px-3
              py-2
              text-sm
            "
          >
            {SURFACES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* dropzone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          border-2
          border-dashed
          rounded-xl
          p-8
          text-center
          transition-all
          cursor-pointer

          ${
            dragging
              ? "border-[#D4AF37] bg-[#D4AF37]/10"
              : "border-white/10 bg-[#18181C]"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="text-3xl mb-3">{loading ? "⏳" : "🪙"}</div>

        <p className="text-sm">
          {loading ? "Analyzing WAV..." : "Drop WAV file or click to browse"}
        </p>
      </div>

      {/* errors */}
      {error && <div className="text-red-400 text-xs">{error}</div>}

      {/* file metadata */}
      {fileMeta && (
        <div
          className="
            bg-[#18181C]
            rounded-lg
            p-3
            text-xs
            font-mono
          "
        >
          <div className="flex justify-between">
            <span className="text-[#7A7870]">FILE</span>

            <span>{fileMeta.name}</span>
          </div>

          <div className="flex justify-between mt-2">
            <span className="text-[#7A7870]">SIZE</span>

            <span>{fileMeta.size}</span>
          </div>
        </div>
      )}
      {/* reload */}
      {fileMeta && (
        <button
          onClick={() => inputRef.current?.click()}
          className="
          w-full
          py-2.5
          rounded-lg
          font-mono
          text-xs
          tracking-widest
          text-[#7A7870]
          border
          border-white/[0.07]
          bg-transparent
          hover:border-[rgba(212,175,55,0.3)]
          hover:text-[#E8E6E0]
          transition-all
          duration-150
        "
        >
          ↺ LOAD ANOTHER FILE
        </button>
      )}
    </div>
  );
}
