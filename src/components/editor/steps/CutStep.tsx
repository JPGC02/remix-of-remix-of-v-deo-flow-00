import { useState, useEffect, useCallback, useRef } from "react";
import { useResilientPlayer } from "@/hooks/useResilientPlayer";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Scissors, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  segments as mockSegments,
  wordSegments as mockWordSegments,
  hookSuggestions,
  formatTime,
  TOTAL_DURATION,
  type HookSuggestion,
  type Segment,
  type WordSegment,
} from "@/data/mockData";
import { ScriptEditor } from "@/components/editor/ScriptEditor";
import { Filmstrip } from "@/components/editor/Filmstrip";
import { CutReviewList } from "@/components/editor/CutReviewList";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import type { UploadOptions } from "@/components/editor/steps/UploadStep";

interface CutStepProps {
  videoUrl?: string | null;
  transcription?: TranscriptionResult | null;
  uploadOptions?: UploadOptions;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

export function CutStep({ videoUrl, transcription, uploadOptions, initialSettings, onSettingsChange, onVideoError }: CutStepProps) {
  const segments: Segment[] = transcription?.segments ?? mockSegments;
  const wordSegments: WordSegment[] = transcription?.wordSegments ?? mockWordSegments;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, _setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const setCurrentTime = useCallback((t: number) => {
    currentTimeRef.current = t;
    _setCurrentTime(t);
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(TOTAL_DURATION);
  const [zoom, setZoom] = useState(2);
  const [removeSilences, setRemoveSilences] = useState(uploadOptions?.removeSilences ?? true);
  const [removeFillers] = useState(uploadOptions?.removeFillers ?? true);
  const [removeBadTakes] = useState(uploadOptions?.removeBadTakes ?? false);
  const [sensitivity, setSensitivity] = useState([92]);
  const [showCuts, setShowCuts] = useState(true);
  const [skipCuts, setSkipCuts] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [hooks] = useState<HookSuggestion[]>(hookSuggestions);
  const isSeeking = useRef(false);
  const rafId = useRef<number>(0);
  const hasVideo = !!videoUrl;
  const duration = hasVideo ? videoDuration : TOTAL_DURATION;

  const { safePlay, recoverFromError, restoreAfterSourceChange } = useResilientPlayer(videoRef, {
    onVideoError,
    onPlayBlocked: (reason) => console.warn(`[CutStep] Play blocked: ${reason}`),
  });

  // Initialize statuses at word level
  const [segmentStatuses, setSegmentStatuses] = useState<Record<string, "kept" | "removed">>(() => {
    if (initialSettings?.segmentStatuses) return initialSettings.segmentStatuses as Record<string, "kept" | "removed">;
    const statuses: Record<string, "kept" | "removed"> = {};
    wordSegments.forEach(ws => { statuses[ws.id] = ws.status === "removed" ? "removed" : "kept"; });
    return statuses;
  });

  // Persist settings on change
  useEffect(() => {
    onSettingsChange?.({ segmentStatuses, sensitivity, removeSilences, showCuts, skipCuts });
  }, [segmentStatuses, sensitivity, removeSilences, showCuts, skipCuts]);

  // Frame-precise edge overrides: keyed by region's first word ID → { start?, end? }
  const [edgeOverrides, setEdgeOverrides] = useState<Record<string, { start?: number; end?: number }>>({});
  const edgeOverridesRef = useRef(edgeOverrides);
  useEffect(() => { edgeOverridesRef.current = edgeOverrides; }, [edgeOverrides]);

  // Drag state — captured at drag start for stable clamping
  const dragClampRef = useRef<{
    min: number; max: number;
    regionId: string; edge: "start" | "end";
    regionStart: number; regionEnd: number;
    wordIds: string[];
  } | null>(null);

  // Real-time silence threshold from sensitivity slider
  // Left (0) = keep all pauses, Right (100) = remove silences >= 0.1s
  useEffect(() => {
    setSegmentStatuses(prev => {
      const next = { ...prev };
      const silenceSegments = wordSegments.filter(ws => ws.type === "silence");
      if (!removeSilences) {
        // If silence removal is off, keep all silences
        silenceSegments.forEach(ws => { next[ws.id] = "kept"; });
        return next;
      }
      // Map slider: 0 → Infinity (keep all), 100 → 0.1s threshold
      // At sensitivity[0]=0: threshold=Infinity (nothing removed)
      // At sensitivity[0]=100: threshold=0.1 (remove anything >= 0.1s)
      const maxSilenceDuration = Math.max(...silenceSegments.map(ws => ws.end - ws.start), 5);
      const t = sensitivity[0] / 100; // 0..1
      const threshold = t === 0 ? Infinity : maxSilenceDuration - t * (maxSilenceDuration - 0.1);
      silenceSegments.forEach(ws => {
        const dur = ws.end - ws.start;
        next[ws.id] = dur >= threshold ? "removed" : "kept";
      });
      return next;
    });
  }, [sensitivity, removeSilences, wordSegments]);

  // Refs to avoid stale closures in video timeupdate
  const skipCutsRef = useRef(skipCuts);
  const segmentStatusesRef = useRef(segmentStatuses);
  useEffect(() => { skipCutsRef.current = skipCuts; }, [skipCuts]);
  useEffect(() => { segmentStatusesRef.current = segmentStatuses; }, [segmentStatuses]);

  // Compute merged removed regions (consecutive removed words merged into ranges)
  // Applies edge overrides for frame-precise boundaries
  // WORD_CUT_PADDING: shrink cut boundaries so we don't clip adjacent kept words
  const WORD_CUT_PADDING = 0.06; // 60ms safety margin
  const getRemovedRegions = useCallback((statuses: Record<string, "kept" | "removed">) => {
    const removed = wordSegments
      .filter(w => statuses[w.id] === "removed")
      .sort((a, b) => a.start - b.start);
    if (removed.length === 0) return [];
    const regions: { ids: string[]; start: number; end: number }[] = [];
    let current = { ids: [removed[0].id], start: removed[0].start, end: removed[0].end };
    for (let i = 1; i < removed.length; i++) {
      if (removed[i].start <= current.end + 0.15) {
        current.end = Math.max(current.end, removed[i].end);
        current.ids.push(removed[i].id);
      } else {
        regions.push(current);
        current = { ids: [removed[i].id], start: removed[i].start, end: removed[i].end };
      }
    }
    regions.push(current);
    // Apply frame-precise edge overrides — check all word IDs
    const overrides = edgeOverridesRef.current;
    return regions.map(r => {
      let ov: { start?: number; end?: number } | undefined;
      for (const id of r.ids) {
        if (overrides[id]) { ov = overrides[id]; break; }
      }
      let start = ov?.start ?? r.start;
      let end = ov?.end ?? r.end;
      // Apply padding: check if adjacent word is kept — if so, shrink boundary
      const sorted = wordSegments.slice().sort((a, b) => a.start - b.start);
      const firstRemovedIdx = sorted.findIndex(w => w.id === r.ids[0]);
      const lastRemovedIdx = sorted.findIndex(w => w.id === r.ids[r.ids.length - 1]);
      if (!ov?.start && firstRemovedIdx > 0 && statuses[sorted[firstRemovedIdx - 1].id] !== "removed") {
        start = start + WORD_CUT_PADDING;
      }
      if (!ov?.end && lastRemovedIdx < sorted.length - 1 && statuses[sorted[lastRemovedIdx + 1].id] !== "removed") {
        end = end - WORD_CUT_PADDING;
      }
      if (end <= start) return null;
      return { id: r.ids[0], start, end };
    }).filter(Boolean) as { id: string; start: number; end: number }[];
  }, [wordSegments]);

  // Find the end time of the removed region the given time falls into, or null
  const findRemovedRegionEnd = useCallback((t: number, statuses: Record<string, "kept" | "removed">): number | null => {
    const regions = getRemovedRegions(statuses);
    for (const r of regions) {
      if (t >= r.start - 0.02 && t < r.end) {
        return r.end;
      }
    }
    return null;
  }, [getRemovedRegions]);

  const toggleSegment = (id: string) => {
    // Clear any edge override for this word's region
    setEdgeOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSegmentStatuses(prev => ({
      ...prev,
      [id]: prev[id] === "removed" ? "kept" : "removed",
    }));
  };

  // Edge drag: ONLY update the edge override position (no word status changes during drag)
  const handleEdgeDrag = useCallback((wordIds: string[], edge: "start" | "end", newTime: number, _maxExtent: number) => {
    const regionId = wordIds[0];
    const regionWords = wordSegments.filter(w => wordIds.includes(w.id));
    if (regionWords.length === 0) return;
    const regionStart = Math.min(...regionWords.map(w => w.start));
    const regionEnd = Math.max(...regionWords.map(w => w.end));

    // Compute clamp boundaries ONCE at drag start
    if (!dragClampRef.current) {
      const snapshotStatuses = segmentStatusesRef.current;
      // Find all other removed regions
      const otherRemoved = wordSegments
        .filter(w => !wordIds.includes(w.id) && (snapshotStatuses[w.id] ?? (w.status === "removed" ? "removed" : "kept")) === "removed")
        .sort((a, b) => a.start - b.start);

      // Merge into contiguous regions
      const otherRegions: { start: number; end: number }[] = [];
      for (const w of otherRemoved) {
        const last = otherRegions[otherRegions.length - 1];
        if (last && w.start <= last.end + 0.15) {
          last.end = Math.max(last.end, w.end);
        } else {
          otherRegions.push({ start: w.start, end: w.end });
        }
      }

      let clampMin = 0;
      let clampMax = duration;
      const leftRegion = [...otherRegions].reverse().find(r => r.end <= regionStart + 0.01);
      if (leftRegion) clampMin = leftRegion.end;
      const rightRegion = otherRegions.find(r => r.start >= regionEnd - 0.01);
      if (rightRegion) clampMax = rightRegion.start;

      dragClampRef.current = { min: clampMin, max: clampMax, regionId, edge, regionStart, regionEnd, wordIds };
    }

    const clamp = dragClampRef.current;
    let clampedTime = Math.max(clamp.min, Math.min(clamp.max, newTime));
    if (edge === "end") clampedTime = Math.max(clampedTime, clamp.regionStart + 0.05);
    else clampedTime = Math.min(clampedTime, clamp.regionEnd - 0.05);

    // ONLY update the edge override — no word status changes
    setEdgeOverrides(prev => ({
      ...prev,
      [regionId]: { ...prev[regionId], [edge]: clampedTime },
    }));
  }, [wordSegments, duration]);

  // On drag END: compute final word statuses from the edge position
  const handleEdgeDragEnd = useCallback(() => {
    const clamp = dragClampRef.current;
    if (!clamp) return;
    const { regionId, edge, regionStart, regionEnd, wordIds } = clamp;
    const override = edgeOverridesRef.current[regionId];
    if (!override) { dragClampRef.current = null; return; }

    const finalStart = edge === "start" ? (override.start ?? regionStart) : regionStart;
    const finalEnd = edge === "end" ? (override.end ?? regionEnd) : regionEnd;

    setSegmentStatuses(prev => {
      const next = { ...prev };
      // Only process words in the allowed zone (between clamp boundaries)
      const affected = wordSegments.filter(
        w => w.end > clamp.min && w.start < clamp.max
      );
      for (const ws of affected) {
        const wordMid = (ws.start + ws.end) / 2;
        const inCut = wordMid >= finalStart && wordMid <= finalEnd;
        if (inCut) {
          next[ws.id] = "removed";
        } else if (wordIds.includes(ws.id)) {
          // Was part of original region but now outside — restore
          next[ws.id] = "kept";
        }
      }
      return next;
    });

    // Clear edge overrides for this region so merged regions don't inherit stale overrides
    setEdgeOverrides(prev => {
      const next = { ...prev };
      delete next[regionId];
      return next;
    });

    dragClampRef.current = null;
  }, [wordSegments]);

  // Sync volume/mute to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume / 100;
      videoRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Sync playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Simulated playback (fallback when no real video)
  useEffect(() => {
    if (hasVideo || !isPlaying) return;
    const interval = setInterval(() => {
      const prev = currentTimeRef.current;
      let next = prev + 0.1 * playbackSpeed;
      if (next >= TOTAL_DURATION) { setIsPlaying(false); setCurrentTime(0); return; }
      if (skipCuts) {
        const regionEnd = findRemovedRegionEnd(next, segmentStatuses);
        if (regionEnd !== null) {
          // Jump past the removed region to the next kept word
          const nextKept = wordSegments
            .filter(w => w.start >= regionEnd - 0.01 && segmentStatuses[w.id] !== "removed")
            .sort((a, b) => a.start - b.start)[0];
          if (nextKept) {
            next = nextKept.start;
          } else {
            setIsPlaying(false); return;
          }
        }
      }
      setCurrentTime(next);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, skipCuts, segmentStatuses, hasVideo, findRemovedRegionEnd]);

  // Helper: find the next kept position from a given time
  const findNextKeptTime = useCallback((fromTime: number): number | null => {
    const statuses = segmentStatusesRef.current;
    const regionEnd = findRemovedRegionEnd(fromTime, statuses);
    if (regionEnd === null) return fromTime; // Not in a removed region
    // Find next kept word after the region
    const nextKept = wordSegments
      .filter(w => w.start >= regionEnd - 0.01 && statuses[w.id] !== "removed")
      .sort((a, b) => a.start - b.start)[0];
    return nextKept ? nextKept.start : null;
  }, [wordSegments, findRemovedRegionEnd]);

  const handlePlayPause = useCallback(() => {
    if (hasVideo && videoRef.current) {
      if (videoRef.current.paused) {
        // Before playing, check if we need to skip to a kept segment
        if (skipCutsRef.current) {
          const nextTime = findNextKeptTime(videoRef.current.currentTime);
          if (nextTime === null) return; // No kept content remaining
          if (nextTime !== videoRef.current.currentTime) {
            isSeeking.current = true;
            videoRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
            const onSeeked = () => {
              isSeeking.current = false;
              videoRef.current?.removeEventListener("seeked", onSeeked);
              safePlay();
              setIsPlaying(true);
            };
            videoRef.current.addEventListener("seeked", onSeeked);
            setTimeout(() => { isSeeking.current = false; }, 500);
            return;
          }
        }
        safePlay();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      // Simulated playback: use ref for latest time (avoids stale closure)
      if (skipCutsRef.current && !isPlaying) {
        const now = currentTimeRef.current;
        const nextTime = findNextKeptTime(now);
        if (nextTime === null) return;
        if (nextTime !== now) {
          setCurrentTime(nextTime);
        }
      }
      setIsPlaying((p) => !p);
    }
  }, [hasVideo, isPlaying, findNextKeptTime]);

  const handleTimeChange = useCallback((t: number) => {
    setCurrentTime(t);
    if (videoRef.current) {
      isSeeking.current = true;
      videoRef.current.currentTime = t;
      // Release lock only after the browser has actually seeked
      const onSeeked = () => {
        isSeeking.current = false;
        videoRef.current?.removeEventListener("seeked", onSeeked);
      };
      videoRef.current.addEventListener("seeked", onSeeked);
      // Safety fallback in case seeked never fires
      setTimeout(() => { isSeeking.current = false; }, 500);
    }
  }, []);

  // High-precision playback loop using requestAnimationFrame
  useEffect(() => {
    if (!hasVideo || !isPlaying) return;
    const tick = () => {
      if (!videoRef.current || isSeeking.current) {
        rafId.current = requestAnimationFrame(tick);
        return;
      }
      const t = videoRef.current.currentTime;
      setCurrentTime(t);

      if (skipCutsRef.current) {
        const statuses = segmentStatusesRef.current;
        const regionEnd = findRemovedRegionEnd(t, statuses);
        if (regionEnd !== null) {
          const nextKept = wordSegments
            .filter(w => w.start >= regionEnd - 0.01 && statuses[w.id] !== "removed")
            .sort((a, b) => a.start - b.start)[0];
          isSeeking.current = true;
          if (nextKept) {
            const onSeeked = () => {
              isSeeking.current = false;
              videoRef.current?.removeEventListener("seeked", onSeeked);
            };
            videoRef.current.addEventListener("seeked", onSeeked);
            videoRef.current.currentTime = nextKept.start;
            setTimeout(() => { isSeeking.current = false; }, 500);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
            isSeeking.current = false;
          }
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [hasVideo, isPlaying, wordSegments, findRemovedRegionEnd]);

  // Fallback: sync time from video events when not playing (seeking etc.)
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || isSeeking.current || isPlaying) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
    restoreAfterSourceChange();
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  // Stats
  const removedWords = wordSegments.filter(ws => segmentStatuses[ws.id] === "removed");
  const totalCuts = removedWords.length;
  const removedTime = removedWords.reduce((acc, ws) => acc + (ws.end - ws.start), 0);
  const keptSegments = segments.filter(s => s.type === "speech" && segmentStatuses[s.id] !== "removed");
  // Count valid takes: contiguous kept speech groups (a segment-level count)
  const validTakes = segments.filter(s => s.type === "speech").filter(s => {
    // A segment is valid if at least one of its words is kept
    const segWords = wordSegments.filter(ws => ws.parentId === s.id);
    return segWords.length === 0 || segWords.some(ws => segmentStatuses[ws.id] !== "removed");
  }).length;
  const keptTime = wordSegments
    .filter(ws => segmentStatuses[ws.id] !== "removed")
    .reduce((acc, ws) => acc + (ws.end - ws.start), 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Main area: Script left + Player right */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — Script Editor (narrower) */}
        <div className="flex-1 basis-1/2 flex flex-col min-h-0 min-w-0 border-r border-border">
          <ScriptEditor
            currentTime={currentTime}
            onTimeChange={handleTimeChange}
            showCuts={showCuts}
            segmentStatuses={segmentStatuses}
            onToggleSegment={toggleSegment}
            segments={segments}
            wordSegments={wordSegments}
          />
        </div>

        {/* RIGHT — Player + Controls */}
        <div className="flex-1 basis-1/2 flex flex-col min-h-0 bg-card">
          {/* Player */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="relative bg-black rounded-lg overflow-hidden w-full aspect-[9/16] max-h-[45vh]">
              {hasVideo ? (
                <video
                  ref={videoRef}
                  src={videoUrl!}
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-contain"
                  onTimeUpdate={handleVideoTimeUpdate}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onEnded={handleVideoEnded}
                  onError={() => { recoverFromError(); }}
                  playsInline
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-1.5">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                      <Play className="w-7 h-7 text-primary ml-0.5" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">5 Dicas de Produtividade</p>
                  </div>
                </div>
              )}
              {/* Subtitle overlay */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center px-3">
                <span className="bg-black/70 text-foreground px-2 py-0.5 rounded text-xs font-medium tracking-wide text-center max-w-full truncate">
                  {segments.find(s => currentTime >= s.start && currentTime < s.end && s.type === "speech")?.text.slice(0, 60) || ""}
                </span>
              </div>
            </div>
          </div>

          {/* Player controls + auto-cut options */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2.5">
            {/* Stats bar */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
              <span><span className="font-medium text-foreground">{validTakes}</span> takes válidos</span>
              <span className="font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
              <span>Final: <span className="font-medium text-foreground font-mono">{formatTime(keptTime)}</span></span>
            </div>

            {/* Time + scrubber */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatTime(currentTime)}</span>
              <Slider value={[currentTime]} max={duration} step={0.1} onValueChange={([v]) => handleTimeChange(v)} className="flex-1" />
              <span className="font-mono">{formatTime(duration)}</span>
            </div>

            {/* Play / skip / volume */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTimeChange(Math.max(0, currentTime - 5))}>
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20" onClick={handlePlayPause}>
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTimeChange(Math.min(duration, currentTime + 5))}>
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {/* Volume controls only */}
                
                <button onClick={() => setMuted(!muted)} className="text-muted-foreground hover:text-foreground">
                  {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <Slider value={[muted ? 0 : volume]} max={100} step={1} onValueChange={([v]) => { setVolume(v); setMuted(v === 0); }} className="w-16" />
              </div>
            </div>

            {/* Auto-cut toggles — grid layout */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Switch checked={removeSilences} onCheckedChange={setRemoveSilences} className="scale-75" />
                <label className="text-[11px]">Silêncios</label>
              </div>
              {removeSilences && (
                <div className="flex items-center gap-2 flex-1">
                  <Slider value={sensitivity} onValueChange={setSensitivity} max={100} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap w-12 text-right">
                    {sensitivity[0] === 0 ? "Tudo" : `≥${((() => {
                      const silenceSegments = wordSegments.filter(ws => ws.type === "silence");
                      const maxDur = Math.max(...silenceSegments.map(ws => ws.end - ws.start), 5);
                      const t = sensitivity[0] / 100;
                      return (maxDur - t * (maxDur - 0.1)).toFixed(1);
                    })())}s`}
                  </span>
                </div>
              )}
            </div>

            {/* Reviewable cut regions */}
            <CutReviewList
              onRestoreAll={() => {
                setSegmentStatuses(() => {
                  const next: Record<string, "kept" | "removed"> = {};
                  wordSegments.forEach(ws => { next[ws.id] = "kept"; });
                  return next;
                });
              }}
              wordSegments={wordSegments}
              segmentStatuses={segmentStatuses}
              currentTime={currentTime}
              onNavigate={handleTimeChange}
              onAccept={(wordIds) => {
                setSegmentStatuses(prev => {
                  const next = { ...prev };
                  wordIds.forEach(id => { next[id] = "removed"; });
                  return next;
                });
              }}
              onReject={(wordIds) => {
                setSegmentStatuses(prev => {
                  const next = { ...prev };
                  wordIds.forEach(id => { next[id] = "kept"; });
                  return next;
                });
              }}
              onAcceptAll={() => {
                setSegmentStatuses(prev => {
                  const next = { ...prev };
                  wordSegments.forEach(ws => {
                    if (ws.status === "removed") next[ws.id] = "removed";
                  });
                  return next;
                });
              }}
              onRejectAll={() => {
                setSegmentStatuses(prev => {
                  const next = { ...prev };
                  wordSegments.forEach(ws => {
                    if (ws.status === "removed") next[ws.id] = "kept";
                  });
                  return next;
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-shrink-0 border-t border-border">
        <div className="flex items-center justify-between px-4 py-1.5 bg-card border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-foreground">{playbackSpeed}x</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={showCuts} onCheckedChange={setShowCuts} className="scale-75" />
              <label className="text-[11px] text-muted-foreground">Mostrar cortes</label>
            </div>
            {showCuts && (
              <div className="flex items-center gap-1.5">
                <Switch checked={skipCuts} onCheckedChange={setSkipCuts} className="scale-75" />
                <label className="text-[11px] text-muted-foreground">Pular cortes</label>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <Scissors className="w-3.5 h-3.5" /> Dividir
            </button>
          </div>
        </div>

        <div className="px-3 py-1.5">
          <Filmstrip
            currentTime={currentTime}
            onTimeChange={handleTimeChange}
            zoom={zoom}
            onZoomChange={setZoom}
            segmentStatuses={segmentStatuses}
            showCuts={showCuts}
            videoUrl={videoUrl}
            onEdgeDrag={handleEdgeDrag}
            onEdgeDragEnd={handleEdgeDragEnd}
            wordSegments={wordSegments}
            duration={duration}
            edgeOverrides={edgeOverrides}
          />
        </div>
      </div>
    </div>
  );
}
