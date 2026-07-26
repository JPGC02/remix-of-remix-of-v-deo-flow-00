import { useRef, useEffect, useCallback } from "react";

interface SpectrumVisualizerProps {
  analyserOriginal: AnalyserNode | null;
  analyserProcessed: AnalyserNode | null;
  isPlaying: boolean;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const FREQ_LABELS = [
  { freq: 100, label: "100" },
  { freq: 1000, label: "1k" },
  { freq: 5000, label: "5k" },
  { freq: 10000, label: "10k" },
];

function freqToX(freq: number, width: number): number {
  return (Math.log10(freq / MIN_FREQ) / Math.log10(MAX_FREQ / MIN_FREQ)) * width;
}

export function SpectrumVisualizer({ analyserOriginal, analyserProcessed, isPlaying }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);

    // Draw grid lines and labels
    ctx.strokeStyle = "hsla(0, 0%, 50%, 0.15)";
    ctx.lineWidth = 0.5;
    ctx.font = "9px monospace";
    ctx.fillStyle = "hsla(0, 0%, 60%, 0.5)";

    for (const { freq, label } of FREQ_LABELS) {
      const x = freqToX(freq, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(label, x + 2, h - 3);
    }

    const drawCurve = (analyser: AnalyserNode | null, color: string, alpha: number) => {
      if (!analyser) return;
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      const sampleRate = analyser.context.sampleRate;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;

      let started = false;
      for (let i = 1; i < bufLen; i++) {
        const freq = (i * sampleRate) / (analyser.fftSize);
        if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
        const x = freqToX(freq, w);
        const y = h - (data[i] / 255) * (h - 10);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // Original: ghost curve
    drawCurve(analyserOriginal, "hsl(210, 60%, 60%)", 0.25);
    // Processed: solid curve
    drawCurve(analyserProcessed, "hsl(150, 70%, 50%)", 0.85);

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [analyserOriginal, analyserProcessed, isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, draw]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Espectro de Frequência</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ background: "hsl(210, 60%, 60%)", opacity: 0.4 }} />
            <span className="text-[9px] text-muted-foreground">Original</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ background: "hsl(150, 70%, 50%)" }} />
            <span className="text-[9px] text-muted-foreground">Processado</span>
          </div>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg bg-surface-raised"
        style={{ height: 120 }}
      />
    </div>
  );
}
