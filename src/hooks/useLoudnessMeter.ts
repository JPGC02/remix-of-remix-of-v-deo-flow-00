import { useRef, useState, useEffect, useCallback } from "react";

export function useLoudnessMeter(analyser: AnalyserNode | null, isPlaying: boolean) {
  const [lufs, setLufs] = useState<number | null>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array | null>(null);

  const measure = useCallback(() => {
    if (!analyser) return;

    const size = analyser.fftSize;
    if (!bufferRef.current || bufferRef.current.length !== size) {
      bufferRef.current = new Float32Array(size);
    }

    const buf = bufferRef.current;
    (analyser as any).getFloatTimeDomainData(buf);

    let sum = 0;
    for (let i = 0; i < bufferRef.current.length; i++) {
      sum += bufferRef.current[i] * bufferRef.current[i];
    }
    const rms = Math.sqrt(sum / bufferRef.current.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    // Approximate LUFS (RMS dB is close for mono without K-weighting)
    const approxLufs = isFinite(db) ? db : null;
    setLufs(approxLufs);

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(measure);
    }
  }, [analyser, isPlaying]);

  useEffect(() => {
    if (isPlaying && analyser) {
      rafRef.current = requestAnimationFrame(measure);
    } else {
      setLufs(null);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, analyser, measure]);

  return lufs;
}
