import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { segments, wordSegments as mockWordSegments, TOTAL_DURATION, formatTime, type WordSegment } from "@/data/mockData";
import { useAudioPeaks, resamplePeaks } from "@/hooks/useAudioPeaks";

interface FilmstripProps {
  currentTime: number;
  onTimeChange: (time: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  segmentStatuses: Record<string, "kept" | "removed">;
  showCuts?: boolean;
  videoUrl?: string | null;
  onEdgeDrag?: (wordIds: string[], edge: "start" | "end", newTime: number, maxExtent: number) => void;
  onEdgeDragEnd?: () => void;
  wordSegments?: WordSegment[];
  duration?: number;
  edgeOverrides?: Record<string, { start?: number; end?: number }>;
}

const WAVEFORM_HEIGHT = 64;
const FRAMES_HEIGHT = 48;

// ── Audio waveform from word segments (no full-video decode — memory safe) ──
function generateWaveformFromSegments(
  wSegments: WordSegment[],
  duration: number,
  numBars: number
): number[] {
  const bars: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * duration;
    const ws = wSegments.find(w => t >= w.start && t < w.end);
    if (!ws) {
      // silence / gap
      bars.push(0.03 + Math.sin(i * 0.7) * 0.02);
    } else if (ws.type === "silence") {
      bars.push(0.03 + Math.sin(i * 0.5) * 0.015);
    } else if (ws.type === "filler") {
      bars.push(0.15 + Math.abs(Math.sin(i * 1.2)) * 0.15);
    } else {
      // speech — vary height pseudo-randomly for visual interest
      const seed = ws.text.length + i;
      bars.push(Math.min(1, Math.max(0.12, 0.3 + Math.abs(Math.sin(seed * 0.8) * Math.cos(seed * 1.7 + 1)) * 0.5 + Math.sin(i * 3.1) * 0.08)));
    }
  }
  return bars;
}



// ── Video frame extraction ──
function useVideoFrames(videoUrl: string | null | undefined, times: number[]) {
  const [frames, setFrames] = useState<Record<number, string>>({});
  const extractedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!videoUrl || times.length === 0) return;
    const urlKey = videoUrl;
    if (!extractedRef.current.has("__url:" + urlKey)) {
      extractedRef.current.clear();
      extractedRef.current.add("__url:" + urlKey);
      setFrames({});
    }
    const timesToExtract = times.filter(t => !extractedRef.current.has(String(t)));
    if (timesToExtract.length === 0) return;

    let cancelled = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 68;
    const ctx = canvas.getContext("2d")!;
    let idx = 0;
    const captureNext = () => {
      if (cancelled || idx >= timesToExtract.length) return;
      video.currentTime = timesToExtract[idx];
    };
    video.addEventListener("seeked", () => {
      if (cancelled || idx >= timesToExtract.length) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const t = timesToExtract[idx];
      extractedRef.current.add(String(t));
      setFrames(prev => ({ ...prev, [t]: dataUrl }));
      idx++;
      setTimeout(captureNext, 30);
    });
    video.addEventListener("loadeddata", () => { captureNext(); });
    video.src = videoUrl;
    return () => { cancelled = true; video.src = ""; };
  }, [videoUrl, times.join(",")]);

  return frames;
}

// ── Mock waveform fallback ──
function generateMockWaveform(numBars: number): number[] {
  const bars: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * TOTAL_DURATION;
    const inSpeech = segments.some(s => s.type === "speech" && s.status === "kept" && t >= s.start && t <= s.end);
    const inSilence = segments.some(s => s.type === "silence" && t >= s.start && t <= s.end);
    if (inSilence) bars.push(0.03 + Math.sin(i * 0.7) * 0.02);
    else if (inSpeech) bars.push(Math.min(1, Math.max(0.08, 0.25 + Math.abs(Math.sin(i * 0.8) * Math.cos(i * 1.7 + 1)) * 0.55 + Math.sin(i * 3.1) * 0.1)));
    else bars.push(0.05);
  }
  return bars;
}

// ── Compute contiguous removed regions ──
function computeRemovedRegions(
  wSegments: WordSegment[],
  statuses: Record<string, "kept" | "removed">
): { id: string; start: number; end: number; wordIds: string[] }[] {
  const regions: { id: string; start: number; end: number; wordIds: string[] }[] = [];
  let current: { start: number; end: number; wordIds: string[] } | null = null;
  const sorted = [...wSegments].sort((a, b) => a.start - b.start);
  for (const ws of sorted) {
    const status = statuses[ws.id] ?? (ws.status === "removed" ? "removed" : "kept");
    if (status === "removed") {
      if (current) {
        // Check if there are any kept SPEECH words between current region end and this word
        const hasKeptSpeechBetween = sorted.some(
          w => w.start >= current!.end - 0.01 && w.end <= ws.start + 0.01 &&
               w.type === "speech" &&
               (statuses[w.id] ?? (w.status === "removed" ? "removed" : "kept")) === "kept"
        );
        if (!hasKeptSpeechBetween) {
          // Merge — only silences/fillers between them
          current.end = Math.max(current.end, ws.end);
          current.wordIds.push(ws.id);
        } else {
          // Split — there's kept speech content between regions
          regions.push({ ...current, id: current.wordIds[0] });
          current = { start: ws.start, end: ws.end, wordIds: [ws.id] };
        }
      } else {
        current = { start: ws.start, end: ws.end, wordIds: [ws.id] };
      }
    }
  }
  if (current) regions.push({ ...current, id: current.wordIds[0] });
  return regions;
}

export function Filmstrip({
  currentTime, onTimeChange, zoom, onZoomChange,
  segmentStatuses, showCuts = true, videoUrl, onEdgeDrag, onEdgeDragEnd,
  wordSegments: wordSegmentsProp, duration: durationProp,
  edgeOverrides
}: FilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const totalWidth = 100 * zoom;
  const wordSegments = wordSegmentsProp ?? mockWordSegments;
  const duration = durationProp ?? TOTAL_DURATION;

  // Auto-scroll to keep playhead centered when currentTime jumps (e.g. word click)
  const prevTimeRef = useRef(currentTime);
  useEffect(() => {
    const delta = Math.abs(currentTime - prevTimeRef.current);
    prevTimeRef.current = currentTime;
    if (delta < 0.5) return;
    const scrollEl = containerRef.current;
    if (!scrollEl) return;
    const innerEl = scrollEl.querySelector("[data-timeline-inner]") as HTMLElement;
    if (!innerEl) return;
    const innerWidth = innerEl.offsetWidth;
    const targetX = (currentTime / duration) * innerWidth;
    const viewWidth = scrollEl.clientWidth;
    scrollEl.scrollTo({ left: targetX - viewWidth / 2, behavior: "smooth" });
  }, [currentTime, duration]);

  // ── Drag state ──
  const draggingRef = useRef<{
    edge: "start" | "end";
    wordIds: string[];
    regionId: string;
    initialTime: number;
  } | null>(null);
  const dragMaxExtentRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ time: number; regionId: string; edge: "start" | "end" } | null>(null);
  const onEdgeDragRef = useRef(onEdgeDrag);
  useEffect(() => { onEdgeDragRef.current = onEdgeDrag; }, [onEdgeDrag]);
  const onEdgeDragEndRef = useRef(onEdgeDragEnd);
  useEffect(() => { onEdgeDragEndRef.current = onEdgeDragEnd; }, [onEdgeDragEnd]);

  const formatTimePrecise = (t: number): string => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const frames = Math.floor((t % 1) * 100);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
  };

  const getTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const scrollEl = containerRef.current;
    if (!scrollEl) return 0;
    const innerEl = scrollEl.querySelector("[data-timeline-inner]") as HTMLElement;
    if (!innerEl) return 0;
    const rect = innerEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(duration, x * duration));
  }, [duration]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const time = getTimeFromMouseEvent(e);
    onTimeChange(time);
  };

  const handleEdgeMouseDown = useCallback((
    e: React.MouseEvent,
    region: { id: string; wordIds: string[]; start: number; end: number },
    edge: "start" | "end"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = {
      edge,
      wordIds: region.wordIds,
      regionId: region.id,
      initialTime: edge === "start" ? region.start : region.end,
    };
    dragMaxExtentRef.current = edge === "start" ? region.start : region.end;
    const initTime = getTimeFromMouseEvent(e);
    setIsDragging(true);
    setDragInfo({ time: initTime, regionId: region.id, edge });

    const handleMouseMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const drag = draggingRef.current;
      if (!drag) return;
      const time = getTimeFromMouseEvent(ev);
      // Track the furthest point dragged during this session
      if (drag.edge === "end") {
        dragMaxExtentRef.current = Math.max(dragMaxExtentRef.current, time);
      } else {
        dragMaxExtentRef.current = Math.min(dragMaxExtentRef.current, time);
      }
      setDragInfo({ time, regionId: drag.regionId, edge: drag.edge });
      onEdgeDragRef.current?.(drag.wordIds, drag.edge, time, dragMaxExtentRef.current);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      ev.preventDefault();
      const drag = draggingRef.current;
      if (drag) {
        const time = getTimeFromMouseEvent(ev);
        if (drag.edge === "end") {
          dragMaxExtentRef.current = Math.max(dragMaxExtentRef.current, time);
        } else {
          dragMaxExtentRef.current = Math.min(dragMaxExtentRef.current, time);
        }
        onEdgeDragRef.current?.(drag.wordIds, drag.edge, time, dragMaxExtentRef.current);
      }
      onEdgeDragEndRef.current?.();
      draggingRef.current = null;
      setIsDragging(false);
      setDragInfo(null);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
    };

    document.addEventListener("mousemove", handleMouseMove, { capture: true });
    document.addEventListener("mouseup", handleMouseUp, { capture: true });
  }, [getTimeFromMouseEvent]);

  const playheadPos = `${(currentTime / duration) * 100}%`;

  const thumbInterval = zoom > 15 ? 0.5 : zoom > 6 ? 1 : zoom > 3 ? 2 : zoom > 1.5 ? 5 : 10;
  const thumbTimes = useMemo(() => {
    const t: number[] = [];
    for (let s = 0; s < duration; s += thumbInterval) t.push(s);
    return t;
  }, [zoom, duration]);

  const markerInterval = zoom > 15 ? 1 : zoom > 6 ? 2 : zoom > 3 ? 5 : zoom > 1.5 ? 10 : 15;
  const markers = useMemo(() => {
    const m: number[] = [];
    for (let t = 0; t <= duration; t += markerInterval) m.push(t);
    return m;
  }, [zoom, duration]);

  const numBars = Math.round(300 * zoom);
  const { peaks: audioPeaks } = useAudioPeaks(videoUrl);
  const waveformBars = useMemo(() => {
    if (audioPeaks) return resamplePeaks(audioPeaks, numBars);
    return generateWaveformFromSegments(wordSegments, duration, numBars);
  }, [audioPeaks, wordSegments, duration, numBars]);
  const videoFrames = useVideoFrames(videoUrl, thumbTimes);

  const removedRegions = useMemo(() => {
    const raw = computeRemovedRegions(wordSegments, segmentStatuses);
    if (!edgeOverrides || Object.keys(edgeOverrides).length === 0) return raw;
    // Apply frame-precise edge overrides — check all wordIds in each region
    return raw.map(region => {
      // Look for an override keyed by ANY word in this region
      let override: { start?: number; end?: number } | undefined;
      for (const wid of region.wordIds) {
        if (edgeOverrides[wid]) {
          override = edgeOverrides[wid];
          break;
        }
      }
      if (!override) return region;
      return {
        ...region,
        start: override.start ?? region.start,
        end: override.end ?? region.end,
      };
    });
  }, [segmentStatuses, edgeOverrides]);

  const getIsRemoved = (t: number) => {
    const ws = wordSegments.find(w => t >= w.start && t < w.end);
    if (!ws) return false;
    return (segmentStatuses[ws.id] ?? (ws.status === "removed" ? "removed" : "kept")) === "removed";
  };
  // Regions already include clamped edge overrides — no raw position bypass needed

  return (
    <div className={cn("bg-[hsl(var(--timeline-bg))] rounded-lg border border-border", isDragging && "select-none")}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <div className="flex items-center gap-2 min-w-[160px]">
          <ZoomOut className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <Slider
            value={[zoom]}
            onValueChange={([v]) => onZoomChange(v)}
            min={1}
            max={50}
            step={0.1}
            className="flex-1"
          />
          <ZoomIn className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </div>
      </div>

      <div className="overflow-x-auto relative" ref={containerRef}>
        {/* Drag time badge — fixed top-left */}
        {isDragging && dragInfo && (
          <div className="sticky left-1 top-0 z-50 pointer-events-none float-left" style={{ marginBottom: -24 }}>
            <div className="bg-[hsl(210,100%,56%)] text-white text-[11px] font-mono font-medium px-1.5 py-0.5 rounded-sm shadow-lg whitespace-nowrap inline-block">
              {formatTimePrecise(dragInfo.time)}
            </div>
          </div>
        )}
        <div data-timeline-inner style={{ width: `${totalWidth}%`, minWidth: "100%" }} className="relative">
          {/* Time ruler */}
          <div className="h-4 border-b border-border relative">
            {markers.map((t) => (
              <span
                key={t}
                className="absolute text-[9px] font-mono text-muted-foreground top-0"
                style={{ left: `${(t / duration) * 100}%`, transform: "translateX(-50%)" }}
              >
                {formatTime(t)}
              </span>
            ))}
          </div>

          {/* Video frames strip */}
          <div className="relative cursor-pointer flex" style={{ height: FRAMES_HEIGHT }} onClick={handleClick}>
            {thumbTimes.map((t, i) => {
              const widthPct = (thumbInterval / duration) * 100;
              const frame = videoFrames[t];
              const hue = (t * 7) % 360;
              return (
                <div
                  key={i}
                  className="h-full border-r border-black/30 flex-shrink-0 relative overflow-hidden"
                  style={{ width: `${widthPct}%` }}
                >
                  {frame ? (
                    <img src={frame} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                  ) : (
                    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue} 20% 15%) 0%, hsl(${(hue + 30) % 360} 15% 12%) 100%)` }} />
                  )}
                </div>
              );
            })}

            {/* Removed region overlays on frames */}
            {showCuts && removedRegions.map((region) => (
              <div
                key={"fr-" + region.id}
                className="absolute top-0 bottom-0 bg-black/60 pointer-events-none"
                style={{
                  left: `${(region.start / duration) * 100}%`,
                  width: `${((region.end - region.start) / duration) * 100}%`,
                }}
              />
            ))}
          </div>

          {/* Audio waveform — single-sided mountain area chart */}
          <div className="relative cursor-pointer border-t border-border/30" style={{ height: WAVEFORM_HEIGHT }} onClick={handleClick}>
            <svg
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
              viewBox={`0 0 ${waveformBars.length} ${WAVEFORM_HEIGHT}`}
            >
              {/* Main waveform area — upward from bottom */}
              <path
                d={(() => {
                  const H = WAVEFORM_HEIGHT;
                  let d = `M 0 ${H}`;
                  for (let i = 0; i < waveformBars.length; i++) {
                    const h = waveformBars[i] * H * 0.92;
                    d += ` L ${i} ${H - h}`;
                  }
                  d += ` L ${waveformBars.length} ${H} Z`;
                  return d;
                })()}
                fill="hsl(var(--primary) / 0.35)"
              />
              {/* Played portion overlay */}
              <defs>
                <clipPath id="wf-played">
                  <rect x="0" y="0" width={`${(currentTime / duration) * waveformBars.length}`} height={WAVEFORM_HEIGHT} />
                </clipPath>
              </defs>
              <path
                d={(() => {
                  const H = WAVEFORM_HEIGHT;
                  let d = `M 0 ${H}`;
                  for (let i = 0; i < waveformBars.length; i++) {
                    const h = waveformBars[i] * H * 0.92;
                    d += ` L ${i} ${H - h}`;
                  }
                  d += ` L ${waveformBars.length} ${H} Z`;
                  return d;
                })()}
                fill="hsl(var(--primary) / 0.55)"
                clipPath="url(#wf-played)"
              />
            </svg>

            {/* Removed region overlays on waveform */}
            {showCuts && removedRegions.map((region) => (
              <div
                key={"wf-" + region.id}
                className="absolute top-0 bottom-0 bg-black/50 pointer-events-none"
                style={{
                  left: `${(region.start / duration) * 100}%`,
                  width: `${((region.end - region.start) / duration) * 100}%`,
                }}
              />
            ))}
          </div>

          {/* Draggable edge handles */}
          {showCuts && removedRegions.map((region) => {
            const leftPct = (region.start / duration) * 100;
            const rightPct = (region.end / duration) * 100;
            return (
              <div key={"handles-" + region.id}>
                {/* Left edge */}
                <div
                  className="absolute z-30 cursor-col-resize group pointer-events-auto"
                  style={{ left: `${leftPct}%`, top: 0, bottom: 0, width: "16px", transform: "translateX(-8px)" }}
                  onMouseDown={(e) => handleEdgeMouseDown(e, region, "start")}
                >
                  <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-primary/30 group-hover:bg-primary transition-colors" />
                  <div className="absolute left-[4px] top-1/2 -translate-y-1/2 w-[8px] h-8 rounded-sm bg-primary/30 group-hover:bg-primary transition-colors flex items-center justify-center">
                    <div className="w-[2px] h-4 bg-background/60 group-hover:bg-background rounded-full" />
                  </div>
                </div>
                {/* Right edge */}
                <div
                  className="absolute z-30 cursor-col-resize group pointer-events-auto"
                  style={{ left: `${rightPct}%`, top: 0, bottom: 0, width: "16px", transform: "translateX(-8px)" }}
                  onMouseDown={(e) => handleEdgeMouseDown(e, region, "end")}
                >
                  <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-primary/30 group-hover:bg-primary transition-colors" />
                  <div className="absolute left-[4px] top-1/2 -translate-y-1/2 w-[8px] h-8 rounded-sm bg-primary/30 group-hover:bg-primary transition-colors flex items-center justify-center">
                    <div className="w-[2px] h-4 bg-background/60 group-hover:bg-background rounded-full" />
                  </div>
                </div>
              </div>
            );
          })}


          {/* Playhead */}
          <div
            className="absolute top-4 bottom-0 w-0.5 bg-[hsl(var(--playhead))] z-30 pointer-events-none"
            style={{ left: playheadPos }}
          >
            <div className="w-2.5 h-2.5 bg-[hsl(var(--playhead))] rounded-full -translate-x-[4px] -top-1 absolute" />
          </div>
        </div>
      </div>
    </div>
  );
}
