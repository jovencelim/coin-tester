import { useEffect, useRef } from "react";

export default function Waveform({ audioUrl }) {
  const canvasRef = useRef();

  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    const ctx = new AudioContext();

    audio.addEventListener("play", () => {
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();

      source.connect(analyser);
      analyser.connect(ctx.destination);

      const canvas = canvasRef.current;
      const c = canvas.getContext("2d");

      analyser.fftSize = 2048;
      const data = new Uint8Array(analyser.frequencyBinCount);

      function draw() {
        requestAnimationFrame(draw);

        analyser.getByteTimeDomainData(data);

        c.fillStyle = "#1e293b";
        c.fillRect(0, 0, canvas.width, canvas.height);

        c.strokeStyle = "#38bdf8";
        c.beginPath();

        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * canvas.width;
          const y = (data[i] / 255) * canvas.height;
          c.lineTo(x, y);
        }

        c.stroke();
      }

      draw();
    });

    audio.play();
  }, [audioUrl]);

  return <canvas ref={canvasRef} width={400} height={100} />;
}