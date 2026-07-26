import { useState, useRef, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { toast } from "@/hooks/use-toast";
import type { StepSettings } from "@/pages/Editor";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import type { WordSegment, BRollSuggestion } from "@/data/mockData";
import { wordSegments as mockWordSegments } from "@/data/mockData";

export interface ExportConfig {
  aspectRatio: string; // "9:16" | "16:9" | "1:1" | "4:5"
  resolution: string;  // "720" | "1080" | "4k"
  quality: string;     // "web" | "high" | "max"
  format: "webm" | "mp4";
}

interface KeptSegment {
  start: number;
  end: number;
}

const ASPECT_DIMENSIONS: Record<string, Record<string, [number, number]>> = {
  "9:16": { "720": [720, 1280], "1080": [1080, 1920], "4k": [2160, 3840] },
  "16:9": { "720": [1280, 720], "1080": [1920, 1080], "4k": [3840, 2160] },
  "1:1":  { "720": [720, 720],  "1080": [1080, 1080], "4k": [2160, 2160] },
  "4:5":  { "720": [720, 900],  "1080": [1080, 1350], "4k": [2160, 2700] },
};

const BITRATE_MAP: Record<string, number> = {
  web: 2_500_000,
  high: 5_000_000,
  max: 10_000_000,
};

function buildFilterString(color: Record<string, unknown> | undefined): string {
  if (!color) return "none";
  const b = Number(color.brightness ?? 100);
  const c = Number(color.contrast ?? 100);
  const s = Number(color.saturation ?? 100);
  const temp = Number(color.temperature ?? 0);
  const intensity = Number(color.intensity ?? 100) / 100;
  const mix = (v: number, neutral: number) => neutral + (v - neutral) * intensity;
  const parts: string[] = [];
  parts.push(`brightness(${mix(b, 100) / 100})`);
  parts.push(`contrast(${mix(c, 100) / 100})`);
  parts.push(`saturate(${mix(s, 100) / 100})`);
  if (temp !== 0) {
    const t = mix(temp, 0);
    if (t > 0) parts.push(`sepia(${Math.min(t / 100, 0.4)})`);
    else parts.push(`hue-rotate(${Math.max(t * 0.5, -30)}deg)`);
  }
  return parts.join(" ");
}

function getKeptSegments(
  wordSegs: WordSegment[],
  statuses: Record<string, "kept" | "removed"> | undefined,
  videoDuration: number
): KeptSegment[] {
  // Collect removed regions from word segments
  const removed: KeptSegment[] = [];
  for (const ws of wordSegs) {
    const status = statuses?.[ws.id] ?? ws.status;
    if (status !== "removed") continue;
    const last = removed[removed.length - 1];
    if (last && Math.abs(ws.start - last.end) < 0.05) {
      last.end = ws.end;
    } else {
      removed.push({ start: ws.start, end: ws.end });
    }
  }

  if (removed.length === 0) return [{ start: 0, end: videoDuration }];

  // Invert: full duration minus removed = kept
  const kept: KeptSegment[] = [];
  let cursor = 0;
  for (const r of removed) {
    if (r.start > cursor) kept.push({ start: cursor, end: r.start });
    cursor = r.end;
  }
  if (cursor < videoDuration) kept.push({ start: cursor, end: videoDuration });
  return kept.length > 0 ? kept : [{ start: 0, end: videoDuration }];
}

function getAcceptedBRolls(stepSettings: StepSettings): BRollSuggestion[] {
  const broll = stepSettings.broll;
  if (!broll?.suggestions) return [];
  return (broll.suggestions as unknown as BRollSuggestion[]).filter(
    (s) => s.status === "accepted"
  );
}

const FONT_MAP: Record<string, string> = {
  montserrat: "Montserrat, sans-serif",
  poppins: "Poppins, sans-serif",
  inter: "Inter, sans-serif",
  bebas: "Bebas Neue, sans-serif",
  oswald: "Oswald, sans-serif",
  lato: "Lato, sans-serif",
};

function drawSubtitles(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  currentTime: number,
  wordSegs: WordSegment[],
  subtitleSettings: Record<string, unknown> | undefined,
  statuses: Record<string, "kept" | "removed"> | undefined
) {
  if (!subtitleSettings || subtitleSettings.subtitlesEnabled === false) return;

  const fontSize = Number(subtitleSettings.fontSize ?? 28);
  const font = String(subtitleSettings.font ?? "montserrat");
  const textColor = String(subtitleSettings.textColor ?? "#FFFFFF");
  const highlightColor = String(subtitleSettings.highlightColor ?? "#FACC15");
  const position = String(subtitleSettings.position ?? "bottom");
  const textCase = String(subtitleSettings.textCase ?? "upper");
  const maxWords = Number(subtitleSettings.maxWords ?? 3);
  const preset = String(subtitleSettings.activePreset ?? "hormozi");

  // Filter kept speech words
  const speechWords = wordSegs.filter(
    (w) => w.type === "speech" && (statuses?.[w.id] ?? w.status) === "kept"
  );

  // Group words
  const groups: { words: WordSegment[]; start: number; end: number }[] = [];
  for (let i = 0; i < speechWords.length; i += maxWords) {
    const chunk = speechWords.slice(i, i + maxWords);
    if (chunk.length > 0) {
      groups.push({ words: chunk, start: chunk[0].start, end: chunk[chunk.length - 1].end });
    }
  }

  const group = groups.find((g) => currentTime >= g.start && currentTime < g.end);
  if (!group) return;

  // Scale fontSize relative to canvas size (designed for ~1920 height)
  const scale = canvasH / 1920;
  const scaledSize = Math.round(fontSize * scale * 2.5);

  const fontFamily = FONT_MAP[font] || FONT_MAP.montserrat;
  const weight = preset === "hormozi" || preset === "outline" ? 900 : preset === "minimal" ? 500 : 700;
  ctx.font = `${weight} ${scaledSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const yRatio = position === "top" ? 0.12 : position === "center" ? 0.5 : 0.86;
  const y = canvasH * yRatio;

  const applyCase = (t: string) => textCase === "upper" ? t.toUpperCase() : textCase === "lower" ? t.toLowerCase() : t;
  const isKaraokeStyle = preset === "karaoke" || preset === "hormozi";

  // Draw outline/stroke
  const strokeWidth = Math.max(2, scaledSize * 0.06);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  const fullText = group.words.map((w) => applyCase(w.text)).join(" ");

  // Background for boxed preset
  if (preset === "boxed") {
    const metrics = ctx.measureText(fullText);
    const pad = scaledSize * 0.4;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    const boxW = metrics.width + pad * 2;
    const boxH = scaledSize * 1.5;
    ctx.fillRect(canvasW / 2 - boxW / 2, y - boxH / 2, boxW, boxH);
  }

  if (isKaraokeStyle) {
    // Draw word by word for karaoke highlight
    let totalWidth = 0;
    const wordWidths: number[] = [];
    const spaceWidth = ctx.measureText(" ").width;
    for (const w of group.words) {
      const ww = ctx.measureText(applyCase(w.text)).width;
      wordWidths.push(ww);
      totalWidth += ww;
    }
    totalWidth += spaceWidth * (group.words.length - 1);

    let xCursor = canvasW / 2 - totalWidth / 2;
    for (let i = 0; i < group.words.length; i++) {
      const word = group.words[i];
      const isActive = currentTime >= word.start && currentTime < word.end;
      const text = applyCase(word.text);

      // Stroke
      ctx.strokeStyle = "#000";
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text, xCursor + wordWidths[i] / 2, y);

      // Fill
      ctx.fillStyle = isActive ? highlightColor : textColor;
      ctx.fillText(text, xCursor + wordWidths[i] / 2, y);

      xCursor += wordWidths[i] + spaceWidth;
    }
  } else {
    // Stroke
    ctx.strokeStyle = "#000";
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(fullText, canvasW / 2, y);

    // Fill
    ctx.fillStyle = textColor;
    ctx.fillText(fullText, canvasW / 2, y);
  }
}

export function useVideoExport(
  videoUrl: string | null,
  transcription: TranscriptionResult | null,
  stepSettings: StepSettings
) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const formatRef = useRef<"webm" | "mp4">("webm");

  const cancelExport = useCallback(() => {
    cancelRef.current = true;
    mediaRecorderRef.current?.stop();
  }, []);

  const startExport = useCallback(async (config: ExportConfig) => {
    if (!videoUrl || isExporting) return;

    cancelRef.current = false;
    setIsExporting(true);
    setProgress(0);
    setDownloadUrl(null);
    setPhase("Preparando...");

    const dims = ASPECT_DIMENSIONS[config.aspectRatio]?.[config.resolution] ?? [1080, 1920];
    const [canvasW, canvasH] = dims;
    const bitrate = BITRATE_MAP[config.quality] ?? BITRATE_MAP.high;

    // Word segments
    const wordSegs: WordSegment[] = transcription?.wordSegments ?? mockWordSegments;
    const cutStatuses = stepSettings.cut?.segmentStatuses as Record<string, "kept" | "removed"> | undefined;

    // Color settings
    const colorFilter = buildFilterString(stepSettings.color);

    // B-Roll
    const acceptedBRolls = getAcceptedBRolls(stepSettings);

    // Subtitle settings
    const subtitleSettings = stepSettings.subtitles;

    // Create video element
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.muted = false;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Falha ao carregar vídeo para exportação"));
      setTimeout(() => reject(new Error("Timeout carregando vídeo")), 30000);
    });

    // Calculate kept segments AFTER video loaded (need video.duration)
    const keptSegments = getKeptSegments(wordSegs, cutStatuses, video.duration);
    const totalKeptDuration = keptSegments.reduce((a, s) => a + (s.end - s.start), 0);

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d")!;

    // Audio setup
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    // Audio only goes to recording, not to speakers

    // Combine canvas stream + audio
    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    // MediaRecorder
    const chunks: Blob[] = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const exportDone = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    recorder.start(1000); // collect data every 1s

    // Process each kept segment sequentially
    let processedDuration = 0;

    for (let si = 0; si < keptSegments.length; si++) {
      if (cancelRef.current) break;

      const seg = keptSegments[si];
      setPhase(`Renderizando segmento ${si + 1}/${keptSegments.length}...`);

      // Seek to segment start
      video.currentTime = seg.start;
      await new Promise<void>((r) => {
        video.onseeked = () => r();
        setTimeout(r, 2000);
      });

      video.muted = true;
      video.play();
      await audioCtx.resume();

      // Render frames until segment end
      await new Promise<void>((resolve) => {
        const renderLoop = () => {
          if (cancelRef.current) {
            video.pause();
            resolve();
            return;
          }

          if (video.currentTime >= seg.end) {
            video.pause();
            resolve();
            return;
          }

          const currentOriginalTime = video.currentTime;

          // Apply color filter
          ctx.filter = colorFilter;

          // Calculate video draw dimensions (cover/fit canvas)
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const videoAR = vw / vh;
          const canvasAR = canvasW / canvasH;

          let sx = 0, sy = 0, sw = vw, sh = vh;
          if (videoAR > canvasAR) {
            // Video wider than canvas — crop sides
            sw = vh * canvasAR;
            sx = (vw - sw) / 2;
          } else {
            // Video taller — crop top/bottom
            sh = vw / canvasAR;
            sy = (vh - sh) / 2;
          }

          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

          // Reset filter for overlays
          ctx.filter = "none";

          // Draw B-Roll overlay
          const activeBRoll = acceptedBRolls.find(
            (b) => currentOriginalTime >= b.timestamp && currentOriginalTime < b.timestamp + b.duration
          );
          if (activeBRoll && activeBRoll.category === "text") {
            // Text overlay
            const textScale = canvasH / 1920;
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(0, canvasH * 0.35, canvasW, canvasH * 0.3);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = `700 ${Math.round(48 * textScale)}px Montserrat, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(activeBRoll.context, canvasW / 2, canvasH / 2);
          }

          // Draw subtitles
          drawSubtitles(ctx, canvasW, canvasH, currentOriginalTime, wordSegs, subtitleSettings, cutStatuses);

          // Update progress
          processedDuration += 1 / 30; // approximate per frame
          const pct = Math.min((processedDuration / totalKeptDuration) * 100, 99);
          setProgress(pct);

          requestAnimationFrame(renderLoop);
        };

        requestAnimationFrame(renderLoop);
      });

      processedDuration = keptSegments.slice(0, si + 1).reduce((a, s) => a + (s.end - s.start), 0);
    }

    // Finish
    recorder.stop();
    video.pause();

    if (!cancelRef.current) {
      setPhase("Finalizando...");
      const webmBlob = await exportDone;

      if (config.format === "mp4") {
        // Convert WebM → MP4 via FFmpeg.wasm
        setPhase("Convertendo para MP4...");
        setProgress(92);

        const ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));

        // Load FFmpeg core (UMD build — required by @ffmpeg/ffmpeg 0.12.x classic worker)
        try {
          // O wrapper do @ffmpeg/ffmpeg cria o Worker como `type: module`,
          // então o load do core obrigatoriamente passa por `await import(coreURL)`
          // (importScripts não existe em module worker). Por isso precisamos do
          // build ESM e de uma URL absoluta da MESMA ORIGEM (blob URL não funciona
          // como dynamic import dentro de module worker em todos os browsers).
          const coreURL = new URL("/ffmpeg/ffmpeg-core.esm.js", window.location.origin).href;
          const wasmURL = new URL("/ffmpeg/ffmpeg-core.wasm", window.location.origin).href;
          await ffmpeg.load({ coreURL, wasmURL });
        } catch (loadErr) {
          console.error("FFmpeg load failed:", loadErr);
          const url = URL.createObjectURL(webmBlob);
          setDownloadUrl(url);
          setProgress(100);
          setPhase("Conversão MP4 indisponível — baixando WebM");
          formatRef.current = "webm";
          toast({
            variant: "destructive",
            title: "Não foi possível converter para MP4",
            description:
              "Falha ao carregar o conversor FFmpeg. O vídeo foi exportado em WebM. Detalhes no console.",
          });
          source.disconnect();
          audioCtx.close();
          video.remove();
          setIsExporting(false);
          return;
        }

        try {
          setProgress(94);
          const webmData = await fetchFile(webmBlob);
          await ffmpeg.writeFile("input.webm", webmData);

          setProgress(95);
          await ffmpeg.exec([
            "-i", "input.webm",
            "-c:v", "libx264",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "output.mp4",
          ]);

          setProgress(98);
          const mp4Data = await ffmpeg.readFile("output.mp4") as Uint8Array;
          const mp4Blob = new Blob([new Uint8Array(mp4Data)], { type: "video/mp4" });
          const url = URL.createObjectURL(mp4Blob);
          setDownloadUrl(url);
          setProgress(100);
          setPhase("Concluído!");
          formatRef.current = "mp4";

          // Cleanup FFmpeg
          ffmpeg.terminate();
        } catch (err) {
          console.error("FFmpeg transcode failed, falling back to WebM:", err);
          const message = err instanceof Error ? err.message : String(err);
          const url = URL.createObjectURL(webmBlob);
          setDownloadUrl(url);
          setProgress(100);
          setPhase("Conversão MP4 falhou — baixando WebM");
          formatRef.current = "webm";
          toast({
            variant: "destructive",
            title: "Falha ao gerar MP4",
            description: `${message.slice(0, 140)}. Baixando WebM como fallback.`,
          });
          try { ffmpeg.terminate(); } catch {}
        }
      } else {
        const url = URL.createObjectURL(webmBlob);
        setDownloadUrl(url);
        setProgress(100);
        setPhase("Concluído!");
        formatRef.current = "webm";
      }
    } else {
      setPhase("Cancelado");
    }

    // Cleanup
    source.disconnect();
    audioCtx.close();
    video.remove();

    setIsExporting(false);
  }, [videoUrl, isExporting, transcription, stepSettings]);

  return { startExport, cancelExport, isExporting, progress, phase, downloadUrl, exportedFormat: formatRef.current };
}
