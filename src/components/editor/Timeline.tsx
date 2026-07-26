import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { segments, TOTAL_DURATION, formatTime, type BRollSuggestion } from "@/data/mockData";
import { useAudioPeaks, resamplePeaks } from "@/hooks/useAudioPeaks";
import { Badge } from "@/components/ui/badge";

interface TimelineProps {
  currentTime: number;
  onTimeChange: (time: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  duration?: number;
  brollSuggestions?: BRollSuggestion[];
  videoUrl?: string | null;
  musicTrack?: { title: string; active: boolean; url?: string; startTime?: number; endTime?: number };
  onMusicRegionChange?: (startTime: number, endTime: number) => void;
}

const TRACK_HEIGHT = 28;
const WAVEFORM_HEIGHT = 36;
const FRAMES_HEIGHT = 32;

// Generate a deterministic pseudo-random waveform based on segments
function generateWaveform(numBars: number): number[] {
  const bars: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * TOTAL_DURATION;
    // Check if this time falls within a speech segment
    const inSpeech = segments.some(s => s.type === "speech" && s.status === "kept" && t >= s.start && t <= s.end);
    const inRemovedSpeech = segments.some(s => s.type === "speech" && s.status === "removed" && t >= s.start && t <= s.end);
    const inSilence = segments.some(s => s.type === "silence" && t >= s.start && t <= s.end);
    
    if (inSilence) {
      bars.push(0.03 + Math.sin(i * 0.7) * 0.02);
    } else if (inRemovedSpeech) {
      bars.push(0.15 + Math.abs(Math.sin(i * 1.3 + 2) * Math.cos(i * 0.4)) * 0.25);
    } else if (inSpeech) {
      // Varied waveform for speech
      const base = 0.25 + Math.abs(Math.sin(i * 0.8) * Math.cos(i * 1.7 + 1)) * 0.55;
      const detail = Math.sin(i * 3.1) * 0.1;
      bars.push(Math.min(1, Math.max(0.08, base + detail)));
    } else {
      bars.push(0.05);
    }
  }
  return bars;
}

const MIN_MUSIC_DURATION = 1; // seconds

interface MusicTrackRowProps {
  musicTrack?: TimelineProps["musicTrack"];
  musicWaveformBars: number[] | null;
  currentTime: number;
  totalDuration: number;
  onMusicRegionChange?: (startTime: number, endTime: number) => void;
  onTimeChange: (time: number) => void;
}

function MusicTrackRow({ musicTrack, musicWaveformBars, currentTime, totalDuration, onMusicRegionChange, onTimeChange }: MusicTrackRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ type: "move" | "left" | "right"; startX: number; origStart: number; origEnd: number } | null>(null);
  const [dragState, setDragState] = useState<{ start: number; end: number } | null>(null);

  const startTime = dragState?.start ?? musicTrack?.startTime ?? 0;
  const endTime = dragState?.end ?? musicTrack?.endTime ?? totalDuration;

  const handleMouseDown = useCallback((type: "move" | "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { type, startX: e.clientX, origStart: startTime, origEnd: endTime };
    setDragState({ start: startTime, end: endTime });

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !trackRef.current) return;
      const trackRect = trackRef.current.getBoundingClientRect();
      const pxPerSec = trackRect.width / totalDuration;
      const dx = ev.clientX - dragRef.current.startX;
      const dtSec = dx / pxPerSec;
      const { origStart, origEnd } = dragRef.current;
      const dur = origEnd - origStart;

      if (dragRef.current.type === "move") {
        let newStart = origStart + dtSec;
        newStart = Math.max(0, Math.min(totalDuration - dur, newStart));
        setDragState({ start: newStart, end: newStart + dur });
      } else if (dragRef.current.type === "left") {
        let newStart = origStart + dtSec;
        newStart = Math.max(0, Math.min(origEnd - MIN_MUSIC_DURATION, newStart));
        setDragState({ start: newStart, end: origEnd });
      } else {
        let newEnd = origEnd + dtSec;
        newEnd = Math.min(totalDuration, Math.max(origStart + MIN_MUSIC_DURATION, newEnd));
        setDragState({ start: origStart, end: newEnd });
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragRef.current) {
        // Read final state before clearing
        const finalState = dragRef.current;
        dragRef.current = null;
      }
      setDragState(prev => {
        if (prev && onMusicRegionChange) onMusicRegionChange(prev.start, prev.end);
        return null;
      });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [startTime, endTime, totalDuration, onMusicRegionChange]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onTimeChange(x * totalDuration);
  };

  const leftPct = (startTime / totalDuration) * 100;
  const widthPct = ((endTime - startTime) / totalDuration) * 100;

  // Filter waveform bars to only show within the music block region
  const blockBars = useMemo(() => {
    if (!musicWaveformBars) return null;
    const total = musicWaveformBars.length;
    const startIdx = Math.floor((startTime / totalDuration) * total);
    const endIdx = Math.ceil((endTime / totalDuration) * total);
    return musicWaveformBars.slice(startIdx, endIdx);
  }, [musicWaveformBars, startTime, endTime, totalDuration]);

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer border-b border-border/50"
      style={{ height: WAVEFORM_HEIGHT }}
      onClick={handleTrackClick}
    >
      {musicTrack?.active && (
        <div
          className="absolute top-0 bottom-0 group"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/40 rounded-l-sm transition-colors"
            onMouseDown={(e) => handleMouseDown("left", e)}
          />
          {/* Right resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 hover:bg-accent/40 rounded-r-sm transition-colors"
            onMouseDown={(e) => handleMouseDown("right", e)}
          />
          {/* Drag body */}
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing rounded-sm border border-accent/30 bg-accent/10"
            onMouseDown={(e) => handleMouseDown("move", e)}
          >
            {blockBars ? (
              <div className="absolute inset-0 flex items-center px-0.5">
                {blockBars.map((height, i) => {
                  const barTime = startTime + (i / blockBars.length) * (endTime - startTime);
                  const isPast = barTime <= currentTime;
                  return (
                    <div key={i} className="flex-1 flex items-center justify-center" style={{ height: "100%" }}>
                      <div
                        className={cn(
                          "w-[1.5px] rounded-full transition-colors duration-75",
                          isPast ? "bg-accent" : "bg-accent/40"
                        )}
                        style={{ height: `${height * 85}%`, minHeight: "1px" }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="absolute inset-0 rounded-sm bg-accent/20" />
            )}
            <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
              <span className="text-[9px] font-medium text-accent-foreground drop-shadow-sm truncate">♫ {musicTrack.title}</span>
            </div>
          </div>

          {/* Drag badge */}
          {dragState && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30">
              <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 whitespace-nowrap">
                {formatTime(dragState.start)} – {formatTime(dragState.end)}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Timeline({ currentTime, onTimeChange, zoom, onZoomChange, duration, brollSuggestions = [], videoUrl, musicTrack, onMusicRegionChange }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const totalDuration = duration ?? TOTAL_DURATION;

  const totalWidth = 100 * zoom;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onTimeChange(x * totalDuration);
  };

  // Generate waveform bars based on zoom level
  const { peaks: audioPeaks } = useAudioPeaks(videoUrl);
  const musicUrl = musicTrack?.active ? musicTrack.url : undefined;
  const { peaks: musicPeaks } = useAudioPeaks(musicUrl ?? null);
  const waveformBars = useMemo(() => {
    const numBars = Math.round(200 * zoom);
    if (audioPeaks) return resamplePeaks(audioPeaks, numBars);
    return generateWaveform(numBars);
  }, [zoom, audioPeaks]);
  const musicWaveformBars = useMemo(() => {
    const numBars = Math.round(200 * zoom);
    if (musicPeaks) return resamplePeaks(musicPeaks, numBars);
    return null;
  }, [zoom, musicPeaks]);

  // Generate frame positions for thumbnails
  const framePositions = useMemo(() => {
    const interval = zoom > 3 ? 2 : zoom > 1.5 ? 4 : 6;
    const frames: number[] = [];
    for (let t = 0; t < totalDuration; t += interval) frames.push(t);
    return frames;
  }, [zoom, totalDuration]);

  const segmentColor = (type: string, status: string) => {
    if (status === "removed") return "bg-[hsl(var(--segment-removed))]/60";
    if (type === "broll") return "bg-[hsl(var(--segment-broll))]";
    return "bg-[hsl(var(--segment-speech))]";
  };

  const playheadPos = `${(currentTime / totalDuration) * 100}%`;

  const markerInterval = zoom > 3 ? 5 : zoom > 1.5 ? 10 : 15;
  const markers: number[] = [];
  for (let t = 0; t <= totalDuration; t += markerInterval) markers.push(t);

  return (
    <div className="bg-[hsl(var(--timeline-bg))] rounded-lg border border-border">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onZoomChange(Math.max(1, zoom - 0.5))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-10 text-center">{zoom.toFixed(1)}x</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onZoomChange(Math.min(6, zoom + 0.5))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Track labels */}
        <div className="w-20 flex-shrink-0 border-r border-border">
          <div className="h-4" /> {/* ruler spacer */}
          {["Frames", "A-Roll", "B-Roll", "Subtitles", "Música", "Audio"].map((label, i) => (
            <div
              key={label}
              className="flex items-center px-2 text-[10px] font-medium text-muted-foreground"
              style={{ height: label === "Audio" || label === "Música" ? WAVEFORM_HEIGHT : label === "Frames" ? FRAMES_HEIGHT : TRACK_HEIGHT }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div className="flex-1 overflow-x-auto relative" ref={containerRef}>
          <div style={{ width: `${totalWidth}%`, minWidth: "100%" }} className="relative">
            {/* Time ruler */}
            <div className="h-4 border-b border-border relative">
              {markers.map((t) => (
                <span
                  key={t}
                  className="absolute text-[9px] font-mono text-muted-foreground top-0"
                  style={{ left: `${(t / totalDuration) * 100}%`, transform: "translateX(-50%)" }}
                >
                  {formatTime(t)}
                </span>
              ))}
            </div>

            {/* Video frames track */}
            <div className="relative cursor-pointer border-b border-border/50" style={{ height: FRAMES_HEIGHT }} onClick={handleClick}>
              <div className="absolute inset-0 flex">
                {framePositions.map((t, i) => {
                  const left = (t / totalDuration) * 100;
                  const nextT = framePositions[i + 1] ?? totalDuration;
                  const width = ((nextT - t) / totalDuration) * 100;
                  // Generate unique gradient per frame to simulate different scenes
                  const hue1 = (t * 3.7 + 20) % 360;
                  const hue2 = (t * 2.3 + 60) % 360;
                  const light = 15 + Math.sin(t * 0.5) * 8;
                  const inSpeech = segments.some(s => s.type === "speech" && t >= s.start && t <= s.end);
                  return (
                    <div
                      key={t}
                      className="absolute top-0.5 bottom-0.5 border-r border-black/20"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: `linear-gradient(135deg, hsl(${hue1}, ${inSpeech ? 25 : 10}%, ${light}%), hsl(${hue2}, ${inSpeech ? 20 : 8}%, ${light + 10}%))`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* A-Roll track */}
            <div className="relative cursor-pointer" style={{ height: TRACK_HEIGHT }} onClick={handleClick}>
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  className={cn(
                    "absolute top-1 bottom-1 rounded-sm transition-opacity",
                    segmentColor(seg.type, seg.status),
                    seg.status === "removed" && "opacity-40"
                  )}
                  style={{
                    left: `${(seg.start / totalDuration) * 100}%`,
                    width: `${((seg.end - seg.start) / totalDuration) * 100}%`,
                  }}
                  title={seg.text || `[${seg.type}]`}
                />
              ))}
            </div>

            <div className="relative" style={{ height: TRACK_HEIGHT }} onClick={handleClick}>
              {brollSuggestions.filter(br => br.status !== "rejected").map((br) => (
                <div
                  key={br.id}
                  className={cn(
                    "absolute top-1 bottom-1 rounded-sm border",
                    br.status === "accepted"
                      ? "bg-[hsl(var(--segment-broll))]/70 border-[hsl(var(--segment-broll))]"
                      : "bg-[hsl(var(--segment-broll))]/30 border-[hsl(var(--segment-broll))] border-dashed"
                  )}
                  style={{
                    left: `${(br.timestamp / totalDuration) * 100}%`,
                    width: `${(br.duration / totalDuration) * 100}%`,
                  }}
                  title={br.context}
                />
              ))}
            </div>

            {/* Subtitles track */}
            <div className="relative" style={{ height: TRACK_HEIGHT }} onClick={handleClick}>
              {segments.filter(s => s.type === "speech" && s.status === "kept").map((seg) => (
                <div
                  key={seg.id}
                  className="absolute top-1 bottom-1 rounded-sm bg-[hsl(var(--segment-subtitle))]/40"
                  style={{
                    left: `${(seg.start / totalDuration) * 100}%`,
                    width: `${((seg.end - seg.start) / totalDuration) * 100}%`,
                  }}
                />
              ))}
            </div>

            {/* Music track */}
            <MusicTrackRow
              musicTrack={musicTrack}
              musicWaveformBars={musicWaveformBars}
              currentTime={currentTime}
              totalDuration={totalDuration}
              onMusicRegionChange={onMusicRegionChange}
              onTimeChange={onTimeChange}
            />

            {/* Audio waveform track */}
            <div className="relative cursor-pointer" style={{ height: WAVEFORM_HEIGHT }} onClick={handleClick}>
              <div className="absolute inset-0 flex items-center">
                {waveformBars.map((height, i) => {
                  const t = (i / waveformBars.length) * totalDuration;
                  const isRemoved = segments.some(s => s.status === "removed" && t >= s.start && t <= s.end);
                  const isSilence = segments.some(s => s.type === "silence" && t >= s.start && t <= s.end);
                  const isPastPlayhead = t <= currentTime;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex items-center justify-center"
                      style={{ height: "100%" }}
                    >
                      <div
                        className={cn(
                          "w-[1.5px] rounded-full transition-colors duration-75",
                          isRemoved
                            ? "bg-[hsl(var(--segment-removed))]/40"
                            : isSilence
                              ? "bg-muted-foreground/15"
                              : isPastPlayhead
                                ? "bg-primary/80"
                                : "bg-[hsl(var(--segment-audio))]/60"
                        )}
                        style={{
                          height: `${height * 85}%`,
                          minHeight: "1px",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[hsl(var(--playhead))] z-10 pointer-events-none"
              style={{ left: playheadPos }}
            >
              <div className="w-2.5 h-2.5 bg-[hsl(var(--playhead))] rounded-full -translate-x-[4px] -top-1 absolute" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
