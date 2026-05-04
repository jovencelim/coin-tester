import { useState } from "react";
import { encodeWAV } from "../utils/wavEncoder";
import { sendAudio } from "../services/api";

export default function Recorder({ onRecorded, onResult }) {
  const [recording, setRecording] = useState(false);

  let audioCtx, processor, source;
  let chunks = [];

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioCtx = new AudioContext({ sampleRate: 44100 });
    source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);

    chunks = [];

    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    setRecording(true);
  };

  const stop = async () => {
    processor.disconnect();
    source.disconnect();

    const samples = new Float32Array(
      chunks.reduce((acc, cur) => acc + cur.length, 0)
    );

    let offset = 0;
    for (let c of chunks) {
      samples.set(c, offset);
      offset += c.length;
    }

    const wavBlob = encodeWAV(samples);

    const url = URL.createObjectURL(wavBlob);
    onRecorded(url);

    const result = await sendAudio(wavBlob);
    onResult(result);

    setRecording(false);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={recording ? stop : start}
        className={`px-6 py-3 rounded-xl font-semibold ${
          recording
            ? "bg-red-500 hover:bg-red-600"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
      >
        {recording ? "Stop" : "Record"}
      </button>

      <p className="text-sm text-slate-400">
        {recording ? "Listening..." : "Idle"}
      </p>
    </div>
  );
}