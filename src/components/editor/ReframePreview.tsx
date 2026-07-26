import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { FaceKeyframe, interpolateFacePosition } from "@/hooks/useFaceTracking";
import { useResilientPlayer } from "@/hooks/useResilientPlayer";

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
type FramingMode = "auto" | "manual" | "fixed";

interface ReframePreviewProps {
  videoUrl?: string | null;
  aspectRatio: AspectRatio;
  framingMode: FramingMode;
  verticalPosition: number;
  zoomLevel: number;
  currentTime: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onDurationChange?: (duration: number) => void;
  onVerticalPositionChange?: (value: number) => void;
  faceKeyframes?: FaceKeyframe[];
  trackingSpeed?: number;
  showBoundingBox?: boolean;
  onVideoError?: () => Promise<string | null>;
}

const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
  "4:5": 4 / 5,
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReframePreview({
  videoUrl,
  aspectRatio,
  framingMode,
  verticalPosition,
  zoomLevel,
  currentTime,
  isPlaying,
  onTimeChange,
  onPlayPause,
  onDurationChange,
  onVerticalPositionChange,
  faceKeyframes = [],
  trackingSpeed = 50,
  showBoundingBox = false,
  onVideoError,
}: ReframePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceAR, setSourceAR] = useState<number | null>(null);
  const dragStartRef = useRef<{ y: number; startPos: number } | null>(null);

  const { safePlay, recoverFromError, restoreAfterSourceChange } = useResilientPlayer(videoRef, {
    onVideoError,
    onPlayBlocked: (reason) => console.warn(`[ReframePreview] Play blocked: ${reason}`),
  });

  // Sync play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (isPlaying) {
      safePlay();
    } else {
      video.pause();
    }
  }, [isPlaying, videoUrl, safePlay]);

  // Sync volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = muted ? 0 : volume / 100;
    video.muted = muted;
  }, [volume, muted]);

  // Sync seek from external
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime, videoUrl]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) onTimeChange(video.currentTime);
  }, [onTimeChange]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setSourceAR(video.videoWidth / video.videoHeight);
      onDurationChange?.(video.duration);
    }
    restoreAfterSourceChange();
  }, [onDurationChange, restoreAfterSourceChange]);

  const handleEnded = useCallback(() => {
    onTimeChange(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [onTimeChange]);

  // Manual drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (framingMode !== "manual") return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { y: e.clientY, startPos: verticalPosition };
    },
    [framingMode, verticalPosition]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStartRef.current || !containerRef.current) return;
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      const deltaY = e.clientY - dragStartRef.current.y;
      const deltaPct = (deltaY / containerHeight) * 100;
      const newPos = Math.max(0, Math.min(100, dragStartRef.current.startPos + deltaPct));
      onVerticalPositionChange?.(newPos);
    },
    [isDragging, onVerticalPositionChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleGlobalUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, [isDragging]);

  // Compute object-position and face data based on mode
  const facePosition = useMemo(() => {
    if (framingMode === "auto" && faceKeyframes.length > 0) {
      return interpolateFacePosition(faceKeyframes, currentTime, trackingSpeed);
    }
    return null;
  }, [framingMode, faceKeyframes, currentTime, trackingSpeed]);

  const computedPosition = useMemo(() => {
    const outputAR = ASPECT_RATIO_VALUES[aspectRatio];

    if (facePosition && sourceAR) {
      // Correct object-position so that the face is truly centered in the visible crop
      const correctAxis = (facePos: number, srcRatio: number, outRatio: number) => {
        // visibleFraction: how much of the source is visible along this axis
        const visible = Math.min(1, outRatio / srcRatio);
        if (visible >= 1) return 50; // no cropping on this axis
        const clamped = Math.max(0, Math.min(1, (facePos - visible / 2) / (1 - visible)));
        return clamped * 100;
      };

      const xPct = correctAxis(facePosition.x, sourceAR, outputAR);
      // For Y axis, invert the ratio comparison
      const yPct = correctAxis(facePosition.y, 1 / sourceAR, 1 / outputAR);

      return `${xPct}% ${yPct}%`;
    }
    return `center ${verticalPosition}%`;
  }, [facePosition, verticalPosition, aspectRatio, sourceAR]);

  const videoStyle: React.CSSProperties = {
    objectFit: "cover",
    objectPosition: computedPosition,
    transform: `scale(${zoomLevel / 100})`,
    width: "100%",
    height: "100%",
  };

  const aspectClass: Record<AspectRatio, string> = {
    "9:16": "aspect-[9/16]",
    "16:9": "aspect-video",
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
  };

  const videoDuration = duration || 124;

  return (
    <div className="flex flex-col items-center gap-3 flex-1 min-h-0">
      {/* Video container with crop */}
      <div
        ref={containerRef}
        className={cn(
          "relative bg-black rounded-lg overflow-hidden max-h-[60vh] w-auto mx-auto",
          aspectClass[aspectRatio],
          framingMode === "manual" && !isDragging && "cursor-grab",
          isDragging && "cursor-grabbing"
        )}
        style={{ maxWidth: ASPECT_RATIO_VALUES[aspectRatio] > 1 ? "100%" : "auto" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            style={videoStyle}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={() => { recoverFromError(); }}
            playsInline
            className="pointer-events-none select-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                <Play className="w-8 h-8 text-primary ml-1" />
              </div>
              <p className="text-xs text-muted-foreground font-mono">Nenhum vídeo carregado</p>
            </div>
          </div>
        )}

        {/* Framing mode indicator */}
        <div className="absolute top-2 left-2 bg-background/70 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] font-medium text-foreground">
          {framingMode === "auto" && "🤖 Auto"}
          {framingMode === "manual" && "🎯 Manual"}
          {framingMode === "fixed" && "🔒 Fixo"}
        </div>

        {/* Aspect ratio badge */}
        <div className="absolute top-2 right-2 bg-background/70 backdrop-blur-sm rounded px-2 py-0.5 text-[10px] font-mono text-foreground">
          {aspectRatio}
        </div>

        {/* Face bounding box overlay */}
        {showBoundingBox && facePosition && (
          <div
            className="absolute border-2 border-primary rounded-md pointer-events-none transition-all duration-150"
            style={{
              left: `${(facePosition.x - facePosition.width / 2) * 100}%`,
              top: `${(facePosition.y - facePosition.width * 1.4 / 2) * 100}%`,
              width: `${facePosition.width * 100}%`,
              height: `${facePosition.width * 1.4 * 100}%`,
              boxShadow: '0 0 0 1px hsl(var(--primary) / 0.3)',
            }}
          >
            <div className="absolute -top-5 left-0 bg-primary text-primary-foreground text-[8px] px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap">
              Rosto detectado
            </div>
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div className="w-full max-w-md space-y-2">
        <Slider
          value={[currentTime]}
          max={videoDuration}
          step={0.1}
          onValueChange={([v]) => {
            onTimeChange(v);
            if (videoRef.current) videoRef.current.currentTime = v;
          }}
          className="w-full"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const t = Math.max(0, currentTime - 5);
                onTimeChange(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20"
              onClick={onPlayPause}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const t = Math.min(videoDuration, currentTime + 5);
                onTimeChange(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMuted(!muted)} className="text-muted-foreground hover:text-foreground">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <Slider
              value={[muted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={([v]) => {
                setVolume(v);
                setMuted(v === 0);
              }}
              className="w-16"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
