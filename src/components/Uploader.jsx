import { useState } from "react";
import { sendAudio } from "../services/api";

export default function Uploader({ onRecorded, onResult }) {
  const [fileName, setFileName] = useState("");

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
      const result = await sendAudio(file);
      onResult(result);
    } catch (err) {
      console.error(err);
      alert("Backend error");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <label className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-xl cursor-pointer font-semibold">
        Upload WAV
        <input type="file" accept=".wav" onChange={handleFile} className="hidden"/>
      </label>

      <p className="text-sm text-slate-400">
        {fileName || "No file selected"}
      </p>
    </div>
  );
}