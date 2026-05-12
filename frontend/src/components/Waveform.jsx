import { useEffect, useRef } from "react";

export default function Waveform({ waveform, onset }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!waveform || waveform.length === 0) return;

    const canvas = canvasRef.current;

    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 1.5;

    ctx.beginPath();

    const midY = height / 2;

    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;

      const y = midY + waveform[i] * midY * 0.9;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    if (onset !== undefined) {
      const onsetX = (onset / waveform.length) * width;

      ctx.strokeStyle = "#D4AF37";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(onsetX, 0);
      ctx.lineTo(onsetX, height);
      ctx.stroke();

      ctx.fillStyle = "#D4AF37";
      ctx.font = "11px monospace";
      ctx.fillText("ONSET", onsetX + 6, 14);
    }
  }, [waveform, onset]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/5">
      <canvas
        ref={canvasRef}
        width={1200}
        height={220}
        className="w-full h-[220px]"
      />
    </div>
  );
}
