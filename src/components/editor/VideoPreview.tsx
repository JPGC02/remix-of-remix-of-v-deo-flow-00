import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Columns2, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTime, TOTAL_DURATION, type BRollSuggestion } from "@/data/mockData";
import { useResilientPlayer } from "@/hooks/useResilientPlayer";

interface VideoPreviewProps {
  currentTime: number;
  onTimeChange: (time: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  videoUrl?: string | null;
  brollSuggestions?: BRollSuggestion[];
  duration?: number;
  transition?: string;
  transitionDuration?: number;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
  mediaLayerRef?: React.RefObject<HTMLDivElement>;
}

type AspectRatio = "9:16" | "16:9" | "1:1";

interface BRollOverlayProps {
  broll: BRollSuggestion;
  aspectRatio: AspectRatio;
  transition: string;
  transitionDuration: number;
  isExiting: boolean;
  cropPosition?: string;
  videoRect?: { top: string; left: string; width: string; height: string };
  onAnimationEnd?: () => void;
}

function BRollOverlay({ broll, aspectRatio, transition, transitionDuration, isExiting, cropPosition = "50% 50%", videoRect, onAnimationEnd }: BRollOverlayProps) {
  return (
    <div
      className={cn(
        "absolute z-10 overflow-hidden rounded-lg",
        isExiting
          ? "animate-broll-fadeout"
          : transition === "cut" ? "" :
            transition === "dissolve" ? "animate-broll-dissolve" :
            transition === "zoom" ? "animate-broll-zoom" :
            transition === "slide" ? "animate-broll-slide" :
            transition === "glitch" ? "animate-broll-glitch" :
            transition === "light-leak" ? "animate-broll-lightleak" : "",
      )}
      style={{
        animationDuration: `${transitionDuration}s`,
        animationFillMode: 'forwards',
        ...(videoRect ? videoRect : { top: 0, left: 0, width: '100%', height: '100%' }),
      }}
      onAnimationEnd={onAnimationEnd}
    >
      {broll.category === "text" ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className={cn(
            "relative max-h-full max-w-full h-full bg-gradient-to-b from-black/90 via-black/70 to-black/90 flex items-center justify-center p-8",
            aspectRatio === "9:16" ? "aspect-[9/16]" : aspectRatio === "1:1" ? "aspect-square" : "aspect-video"
          )}>
            <span className="text-2xl font-bold text-white text-center drop-shadow-lg leading-relaxed">{broll.transcriptExcerpt || broll.context}</span>
          </div>
        </div>
      ) : (broll as any).aiVideoUrl ? (
        <video
          key={`broll-ai-${broll.id}`}
          src={(broll as any).aiVideoUrl}
          className="w-full h-full object-cover bg-black"
          style={{ objectPosition: cropPosition }}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : broll.mediaUrls && broll.mediaUrls.length > 0 ? (
        <video
          key={`broll-video-${broll.id}`}
          src={broll.mediaUrls[(broll as any).selectedIndex ?? 0]}
          className="w-full h-full object-cover bg-black"
          style={{ objectPosition: cropPosition }}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : broll.thumbnails.length > 0 ? (
        <img
          src={broll.thumbnails[(broll as any).selectedIndex ?? 0]}
          alt="B-Roll"
          className="w-full h-full object-cover bg-black"
          style={{ objectPosition: cropPosition }}
        />
      ) : null}
      <Badge className="absolute top-2 right-2 z-20 text-[10px]" variant="secondary">
        B-Roll
      </Badge>
    </div>
  );
}

export function VideoPreview({ currentTime, onTimeChange, isPlaying, onPlayPause, videoUrl, brollSuggestions, duration, transition = "dissolve", transitionDuration = 0.5, onVideoError, isLoadingUrl, mediaLayerRef }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [showComparison, setShowComparison] = useState(false);
  const [videoDuration, setVideoDuration] = useState(duration || TOTAL_DURATION);
  const [videoRect, setVideoRect] = useState<{ top: string; left: string; width: string; height: string } | undefined>(undefined);
  const isSeeking = useRef(false);
  const lastBRollRef = useRef<BRollSuggestion | undefined>(undefined);
  const [exitCleared, setExitCleared] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Reset videoLoaded when URL changes
  useEffect(() => { setVideoLoaded(false); }, [videoUrl]);

  const effectiveDuration = videoDuration || duration || TOTAL_DURATION;

  // Calculate the "contained" video rect within the container
  const updateVideoRect = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) return;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const videoAR = video.videoWidth / video.videoHeight;
    const containerAR = containerW / containerH;

    let renderW: number, renderH: number;
    if (videoAR > containerAR) {
      // Video is wider — letterbox top/bottom
      renderW = containerW;
      renderH = containerW / videoAR;
    } else {
      // Video is taller — pillarbox left/right
      renderH = containerH;
      renderW = containerH * videoAR;
    }

    const top = (containerH - renderH) / 2;
    const left = (containerW - renderW) / 2;

    setVideoRect({
      top: `${(top / containerH) * 100}%`,
      left: `${(left / containerW) * 100}%`,
      width: `${(renderW / containerW) * 100}%`,
      height: `${(renderH / containerH) * 100}%`,
    });
  }, []);

  const { safePlay, recoverFromError, restoreAfterSourceChange } = useResilientPlayer(videoRef, {
    onVideoError,
    onPlayBlocked: (reason) => console.warn(`[VideoPreview] Play blocked: ${reason}`),
  });

  // Sync play/pause state to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (isPlaying) {
      safePlay();
    } else {
      video.pause();
    }
  }, [isPlaying, videoUrl, safePlay]);

  // Sync volume/muted
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume / 100;
    video.muted = muted;
  }, [volume, muted]);

  // Seek video when currentTime changes externally (timeline click)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  // Update currentTime from video timeupdate
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    onTimeChange(video.currentTime);
  }, [onTimeChange]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration && isFinite(video.duration)) {
      setVideoDuration(video.duration);
    }
    updateVideoRect();
    restoreAfterSourceChange();
  }, [updateVideoRect, restoreAfterSourceChange]);

  // Recalculate video rect on resize or aspect ratio change
  useEffect(() => {
    updateVideoRect();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateVideoRect());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateVideoRect, aspectRatio]);

  const handleSliderChange = useCallback((value: number) => {
    isSeeking.current = true;
    onTimeChange(value);
    if (videoRef.current) {
      videoRef.current.currentTime = value;
    }
    setTimeout(() => { isSeeking.current = false; }, 100);
  }, [onTimeChange]);

  // Find active accepted B-Roll overlay (memoized to avoid remounting video)
  const activeBRoll = useMemo(() => 
    brollSuggestions?.find(s =>
      s.status === "accepted" &&
      currentTime >= s.timestamp &&
      currentTime <= s.timestamp + s.duration
    ),
    [brollSuggestions, currentTime]
  );

  // Synchronous exit tracking — no useEffect to avoid 1-frame gap
  const displayBRoll = useMemo(() => {
    if (activeBRoll) {
      lastBRollRef.current = activeBRoll;
      return { broll: activeBRoll, isExiting: false };
    }
    if (lastBRollRef.current) {
      return { broll: lastBRollRef.current, isExiting: true };
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBRoll, exitCleared]);

  const handleBRollAnimationEnd = useCallback(() => {
    lastBRollRef.current = undefined;
    setExitCleared(c => c + 1);
  }, []);

  const aspectClasses: Record<AspectRatio, string> = {
    "9:16": "aspect-[9/16] max-h-[60vh]",
    "16:9": "aspect-video max-h-[50vh]",
    "1:1": "aspect-square max-h-[50vh]",
  };

  return (
    <div className="flex flex-col items-center gap-3 flex-1">
      <div className="flex items-center gap-1 bg-surface-raised rounded-lg p-1">
        {(["9:16", "16:9", "1:1"] as AspectRatio[]).map((ratio) => (
          <button
            key={ratio}
            onClick={() => setAspectRatio(ratio)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              aspectRatio === ratio ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ratio}
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => setShowComparison(!showComparison)}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            showComparison ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          title="Antes/Depois"
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={containerRef} className={cn("relative bg-black rounded-lg overflow-hidden w-full mx-auto", aspectClasses[aspectRatio])}>
        {/* Loading overlay */}
        {(isLoadingUrl || (videoUrl && !videoLoaded)) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
            <span className="text-xs text-muted-foreground">Carregando vídeo...</span>
          </div>
        )}
        {videoUrl ? (
          <div
            ref={mediaLayerRef}
            className="absolute inset-0"
            style={{ transformOrigin: "center center", willChange: "transform" }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => { setVideoLoaded(true); handleLoadedMetadata(); }}
              onEnded={() => { if (isPlaying) onPlayPause(); }}
              onError={() => { setVideoLoaded(false); recoverFromError(); }}
              playsInline
            />
            {/* B-Roll overlay — single element, no remount */}
            {displayBRoll && (
              <BRollOverlay
                key={`broll-${displayBRoll.broll.id}`}
                broll={displayBRoll.broll}
                aspectRatio={aspectRatio}
                transition={displayBRoll.isExiting ? "fadeout" : transition}
                transitionDuration={transitionDuration}
                isExiting={displayBRoll.isExiting}
                cropPosition={(displayBRoll.broll as any).cropPosition || "50% 50%"}
                videoRect={videoRect}
                onAnimationEnd={displayBRoll.isExiting ? handleBRollAnimationEnd : undefined}
              />
            )}
          </div>
        ) : showComparison ? (
          <div className="absolute inset-0 flex">
            <div className="w-1/2 bg-muted/20 flex items-center justify-center border-r border-white/20">
              <span className="text-xs text-muted-foreground font-mono">ANTES</span>
            </div>
            <div className="w-1/2 flex items-center justify-center">
              <span className="text-xs text-muted-foreground font-mono">DEPOIS</span>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                <Play className="w-8 h-8 text-primary ml-1" />
              </div>
              <p className="text-xs text-muted-foreground font-mono">Faça upload de um vídeo</p>
            </div>
          </div>
        )}

      </div>

      <div className="w-full max-w-md space-y-2">
        <Slider value={[currentTime]} max={effectiveDuration} step={0.1} onValueChange={([v]) => handleSliderChange(v)} className="w-full" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSliderChange(Math.max(0, currentTime - 5))}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20" onClick={onPlayPause}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSliderChange(Math.min(effectiveDuration, currentTime + 5))}>
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMuted(!muted)} className="text-muted-foreground hover:text-foreground">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <Slider value={[muted ? 0 : volume]} max={100} step={1} onValueChange={([v]) => { setVolume(v); setMuted(v === 0); }} className="w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
