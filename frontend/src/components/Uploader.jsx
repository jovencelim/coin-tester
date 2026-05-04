import { useState } from "react";
import { sendAudio } from "../services/api";

export default function Uploader({ onRecorded, onResult }) {
  const [fileName, setFileName] = useState("");

  const [dropHeight, setDropHeight] = useState(30);
  const [surface, setSurface] = useState("Glass");

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".wav")) {
      alert("Please upload a WAV file");
      return;
    }

    setFileName(file.name);

    const url = URL.createObjectURL(file);
    onRecorded(url);

    try {
      const result = await sendAudio(file, {
        dropHeight,
        surface,
      });

      onResult(result);
    } catch (err) {
      console.error(err);
      alert("Backend error");
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {/* 🔹 Drop Height */}
      <div>
        <label className="text-sm text-slate-400">Drop Height (cm)</label>
        <input
          type="number"
          value={dropHeight}
          onChange={(e) => setDropHeight(e.target.value)}
          className="w-full bg-slate-700 p-2 rounded-md"
        />
      </div>

      {/* 🔹 Surface Type */}
      <div>
        <label className="text-sm text-slate-400">Surface Type</label>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
          className="w-full bg-slate-700 p-2 rounded-md"
        >
          <option value="wood">Wood</option>
          <option value="tile">Tile</option>
          <option value="concrete">Concrete</option>
        </select>
      </div>

      {/* 🔹 Upload */}
      <label className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-xl cursor-pointer text-center font-semibold">
        Upload WAV
        <input
          type="file"
          accept=".wav"
          onChange={handleFile}
          className="hidden"
        />
      </label>

      <p className="text-sm text-slate-400 text-center">
        {fileName || "No file selected"}
      </p>
    </div>
  );
}