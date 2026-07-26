import { useState, useEffect, useRef, useCallback } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export interface FaceKeyframe {
  time: number;
  faceX: number; // normalized 0-1 (center of face)
  faceY: number; // normalized 0-1 (center of face)
  faceWidth: number; // normalized 0-1
}

interface UseFaceTrackingResult {
  keyframes: FaceKeyframe[];
  isAnalyzing: boolean;
  progress: number; // 0-100
  error: string | null;
}

const SAMPLE_INTERVAL = 0.5; // seconds between samples
const DEAD_ZONE = 0.06; // 6% threshold to ignore micro-movements

export function useFaceTracking(
  videoUrl: string | null | undefined,
  enabled: boolean
): UseFaceTrackingResult {
  const [keyframes, setKeyframes] = useState<FaceKeyframe[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const analyzedUrlRef = useRef<string | null>(null);

  const analyze = useCallback(async (url: string) => {
    if (analyzedUrlRef.current === url) return;

    setIsAnalyzing(true);
    setProgress(0);
    setError(null);
    setKeyframes([]);
    abortRef.current = false;

    try {
      // Initialize MediaPipe
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });

      // Create offscreen video + canvas
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "auto";

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Falha ao carregar vídeo para análise"));
        setTimeout(() => reject(new Error("Timeout ao carregar vídeo")), 15000);
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 640); // downsample for speed
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      const ctx = canvas.getContext("2d")!;

      const duration = video.duration;
      const totalSamples = Math.ceil(duration / SAMPLE_INTERVAL);
      const results: FaceKeyframe[] = [];

      for (let i = 0; i <= totalSamples; i++) {
        if (abortRef.current) break;

        const time = Math.min(i * SAMPLE_INTERVAL, duration);
        video.currentTime = time;

        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 500); // fallback
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const detections = detector.detect(canvas);
          if (detections.detections.length > 0) {
            const face = detections.detections[0];
            const bbox = face.boundingBox!;
            // Normalize to 0-1
            const faceX = (bbox.originX + bbox.width / 2) / canvas.width;
            const rawY = (bbox.originY + bbox.height / 2) / canvas.height;
            // Apply headroom offset — shift focus point up by 35% of face height
            const headroomOffset = (bbox.height / canvas.height) * 0.35;
            const faceY = Math.max(0, rawY - headroomOffset);
            const faceWidth = bbox.width / canvas.width;

            // Dead zone: ignore micro-movements
            if (results.length > 0) {
              const last = results[results.length - 1];
              if (Math.abs(faceX - last.faceX) < DEAD_ZONE && Math.abs(faceY - last.faceY) < DEAD_ZONE) {
                results.push({ ...last, time });
              } else {
                results.push({ time, faceX, faceY, faceWidth });
              }
            } else {
              results.push({ time, faceX, faceY, faceWidth });
            }
          } else if (results.length > 0) {
            // No face detected — keep last known position
            results.push({ ...results[results.length - 1], time });
          }
        } catch {
          // Skip frame on detection error
        }

        setProgress(Math.round((i / totalSamples) * 100));
      }

      detector.close();
      video.remove();

      if (!abortRef.current) {
        // Consolidate redundant keyframes: keep only start/end of same-position runs
        const consolidated: FaceKeyframe[] = [];
        for (let j = 0; j < results.length; j++) {
          const curr = results[j];
          const prev = results[j - 1];
          const next = results[j + 1];
          const sameAsPrev = prev && curr.faceX === prev.faceX && curr.faceY === prev.faceY;
          const sameAsNext = next && curr.faceX === next.faceX && curr.faceY === next.faceY;
          // Keep if it's a boundary (first, last, or position changed from prev/next)
          if (!sameAsPrev || !sameAsNext) {
            consolidated.push(curr);
          }
        }
        setKeyframes(consolidated);
        analyzedUrlRef.current = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na análise");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !videoUrl) {
      // Reset when disabled
      if (!enabled) {
        analyzedUrlRef.current = null;
        setKeyframes([]);
      }
      return;
    }

    analyze(videoUrl);

    return () => {
      abortRef.current = true;
    };
  }, [videoUrl, enabled, analyze]);

  return { keyframes, isAnalyzing, progress, error };
}

/**
 * Interpolate face position at a given time from keyframes.
 * smoothing: 0 = instant snap, 100 = very smooth (slow follow)
 */
export function interpolateFacePosition(
  keyframes: FaceKeyframe[],
  time: number,
  smoothing: number = 50
): { x: number; y: number; width: number } | null {
  if (keyframes.length === 0) return null;

  // Find surrounding keyframes
  let before = keyframes[0];
  let after = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time <= time && keyframes[i + 1].time >= time) {
      before = keyframes[i];
      after = keyframes[i + 1];
      break;
    }
  }

  if (time <= before.time) return { x: before.faceX, y: before.faceY, width: before.faceWidth };
  if (time >= after.time) return { x: after.faceX, y: after.faceY, width: after.faceWidth };

  // Linear interpolation with strong damping
  const dt = after.time - before.time;
  const t = dt > 0 ? (time - before.time) / dt : 0;

  const dx = after.faceX - before.faceX;
  const dy = after.faceY - before.faceY;
  const dw = after.faceWidth - before.faceWidth;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Small movements (< 5%) get extra damping
  if (dist < 0.05) {
    const damped = t < 0.8 ? 0 : (t - 0.8) / 0.2;
    return {
      x: before.faceX + dx * damped,
      y: before.faceY + dy * damped,
      width: before.faceWidth + dw * damped,
    };
  }

  // Larger movements: smooth S-curve easing
  const easeFactor = 0.5 + (smoothing / 100) * 2;
  const eased = Math.pow(t, 1 / easeFactor);

  return {
    x: before.faceX + dx * eased,
    y: before.faceY + dy * eased,
    width: before.faceWidth + dw * eased,
  };
}
