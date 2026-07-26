import { useRef, useState, useEffect } from "react";

const HIGH_RES_PEAKS = 2000;
const MAX_DECODE_BYTES = 300 * 1024 * 1024; // ~300MB safety limit

/**
 * Decode audio from a video URL and extract normalized peaks (0-1).
 * Decodes once per URL, then resamples client-side for different zoom levels.
 */
export function useAudioPeaks(videoUrl: string | null | undefined) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cachedUrlRef = useRef<string | null>(null);
  const cachedPeaksRef = useRef<number[] | null>(null);

  useEffect(() => {
    if (!videoUrl) {
      setPeaks(null);
      return;
    }

    // Cache hit
    if (videoUrl === cachedUrlRef.current && cachedPeaksRef.current) {
      setPeaks(cachedPeaksRef.current);
      return;
    }

    let cancelled = false;

    async function extract() {
      setIsLoading(true);
      try {
        const res = await fetch(videoUrl!);
        if (!res.ok) throw new Error("fetch failed");

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_DECODE_BYTES) {
          console.warn("Audio too large for peak extraction, using fallback");
          setPeaks(null);
          setIsLoading(false);
          return;
        }

        const ctx = new AudioContext();
        let audioBuffer: AudioBuffer;
        try {
          audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        } finally {
          await ctx.close();
        }

        if (cancelled) return;

        // Extract peaks from first channel
        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / HIGH_RES_PEAKS);
        const extracted: number[] = [];

        for (let i = 0; i < HIGH_RES_PEAKS; i++) {
          const start = i * blockSize;
          const end = Math.min(start + blockSize, channelData.length);
          let max = 0;
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > max) max = abs;
          }
          extracted.push(max);
        }

        // Normalize to 0-1
        const peakMax = Math.max(...extracted, 0.001);
        const normalized = extracted.map(v => v / peakMax);

        if (cancelled) return;

        cachedUrlRef.current = videoUrl!;
        cachedPeaksRef.current = normalized;
        setPeaks(normalized);
      } catch (err) {
        console.warn("Failed to extract audio peaks:", err);
        if (!cancelled) setPeaks(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    extract();
    return () => { cancelled = true; };
  }, [videoUrl]);

  return { peaks, isLoading };
}

/** Resample a peaks array to a target count using max-pooling */
export function resamplePeaks(data: number[], targetCount: number): number[] {
  if (data.length === 0) return Array(targetCount).fill(0);
  if (data.length === targetCount) return data;
  const result: number[] = [];
  const ratio = data.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let max = 0;
    for (let j = start; j < end && j < data.length; j++) {
      if (data[j] > max) max = data[j];
    }
    result.push(max);
  }
  return result;
}
